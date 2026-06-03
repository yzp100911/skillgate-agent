import { config, getModel, getApiConfig } from './config.js';

/**
 * 调用 LLM API（根据当前模型自动选择对应 API）
 * @param {Array} messages - 消息历史
 * @param {Array} tools - 工具定义
 * @returns {Promise<object>} - API 响应
 */
export async function callLLM(messages, tools) {
  const apiConfig = getApiConfig();
  const url = `${apiConfig.baseURL}/chat/completions`;
  const model = getModel();
  const maxTokens = model.startsWith('deepseek-v4-flash') ? 393216 : model.startsWith('mimo-v2.5-pro') ? 131072 : 196608;

  const body = {
    model: model.replace('[1M]', ''),
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
    top_p: 0.95,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  let resp;
  try {
    resp = await fetch(url, {
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
      throw new Error('LLM 请求超时（120 秒无响应）');
    }
    throw new Error(`LLM 网络错误: ${err.message}`);
  }
  clearTimeout(timeoutId);

  const durationMs = Date.now() - startTime;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`LLM API 错误 (${resp.status}): ${errText}`);
  }

  const text = await resp.text();
  if (!text) throw new Error('LLM API 返回了空响应');
  const data = JSON.parse(text);

  // 异步追踪统计，不影响主流程
  import('./stats/tracker.js').then(({ trackLLMCall }) => {
    try {
      trackLLMCall({
        model: getModel(),
        promptTokens: data.usage?.prompt_tokens || data.usage?.promptTokens,
        completionTokens: data.usage?.completion_tokens || data.usage?.completionTokens,
        durationMs,
      });
    } catch {}
  }).catch(() => {});

  return data;
}
