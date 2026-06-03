/**
 * Gateway 流式 LLM 调用
 * 根据当前模型自动选择对应 API
 */

import { getModel, getApiConfig } from '../config.js';

/**
 * 流式调用 LLM
 * @param {Array} messages - 消息历史
 * @param {Array} tools - 工具定义
 * @param {object} callbacks
 * @param {Function} callbacks.onChunk - (text) => void 文本片段
 * @param {Function} callbacks.onToolCall - (toolCall) => void 工具调用
 * @param {Function} callbacks.onDone - (usage) => void 完成回调
 * @param {Function} callbacks.onError - (err) => void 错误回调
 */
export async function callLLMStream(messages, tools, callbacks) {
  const apiConfig = getApiConfig();
  const url = `${apiConfig.baseURL}/chat/completions`;
  const model = getModel();

  // 不同模型的 max_tokens 限制不同
  const maxTokens = model.startsWith('deepseek-v4-flash') ? 393216 : model.startsWith('mimo-v2.5-pro') ? 131072 : 196608;

  const body = {
    model: model.replace('[1M]', ''),
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
    top_p: 0.95,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // 设置请求超时（300秒），防止无限挂起
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiConfig.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      callbacks.onError?.(new Error('请求超时，LLM 300 秒未响应'));
    } else {
      callbacks.onError?.(new Error(`网络错误: ${err.message}`));
    }
    return;
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    callbacks.onError?.(new Error(`API 错误 (${response.status}): ${errText}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = {};
  let chunkIndex = 0;
          let reasoningBuffer = '';    // DeepSeek reasoning_content 缓冲区
  let reasoningOpened = false;  // 是否已发送 <think>
  let reasoningClosed = false;  // 是否已闭合 </think>

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;
                    chunkIndex++;
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];

          if (parsed.usage) {
            usage = parsed.usage;
          }

          // DeepSeek: 推理过程（reasoning_content）
          if (choice?.delta?.reasoning_content) {
            reasoningBuffer += choice.delta.reasoning_content;
            console.log(`[llm-stream] #${chunkIndex} reasoning="${choice.delta.reasoning_content.substring(0,80)}"`);
            if (!reasoningOpened) {
              callbacks.onChunk?.('<think>' + choice.delta.reasoning_content);
              reasoningOpened = true;
            } else {
              callbacks.onChunk?.(choice.delta.reasoning_content);
            }
          }

          // 推理结束、内容开始时，闭合 <think> 标记（仅一次）
          if (reasoningOpened && !reasoningClosed && (choice?.delta?.content || choice?.delta?.tool_calls)) {
            callbacks.onChunk?.('</think>');
            reasoningClosed = true;
          }

          if (choice?.delta?.content) {
            // 避免 DeepSeek 过渡段重复：当本块同时有 reasoning_content 和 content 时，
            // content 开头的文本与 reasoning 重复（模型在此从思考过渡到回答），跳过重复部分
            if (choice?.delta?.reasoning_content && choice.delta.content.startsWith(choice.delta.reasoning_content)) {
              console.log(`[llm-stream] #${chunkIndex} content="${choice.delta.content.substring(0,80)}" → SKIP(dup)`);
            } else {
              console.log(`[llm-stream] #${chunkIndex} content="${choice.delta.content.substring(0,80)}"`);
              callbacks.onChunk?.(choice.delta.content);
            }
          }

          if (choice?.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              callbacks.onToolCall?.(tc);
            }
          }

          // 非流式响应的 finish_reason
          if (choice?.finish_reason) {
            if (reasoningOpened && !reasoningClosed) {
              callbacks.onChunk?.('</think>');
              reasoningClosed = true;
            }
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } catch (err) {
    callbacks.onError?.(new Error(`流读取错误: ${err.message}`));
    return;
  }

  callbacks.onDone?.(usage);
}
