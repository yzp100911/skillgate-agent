/**
 * xCrab Gateway REST API 路由
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLMStream } from './llm-stream.js';
import { config, getModel, setModel } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

export function createApiHandler(deps) {
  const { skillManager, memoryStore, mcpManager, callLLM, toolDefinitions, executeTool, workspaceManager } = deps;
  const router = Router();

  // ========== SSE 连接管理 ==========
  // Map<sessionId, Response[]>
  const sseClients = new Map();
  const sseHeartbeats = new Map();
  // Map<sessionId, AbortController>
  const sessionControllers = new Map();

  /** 向 SSE 客户端推送消息 */
  function pushSSE(sessionId, data) {
    if (sseClients.has(sessionId)) {
      const msg = `data: ${JSON.stringify(data)}\n\n`;
      sseClients.get(sessionId).forEach(res => {
        try { res.write(msg); } catch { /* 忽略断开连接 */ }
      });
    }
  }

  /** 清理会话资源 */
  function cleanupSession(sessionId) {
    if (sseHeartbeats.has(sessionId)) {
      clearInterval(sseHeartbeats.get(sessionId));
      sseHeartbeats.delete(sessionId);
    }
    sseClients.delete(sessionId);
    sessionControllers.delete(sessionId);
  }

  // ========== API 路由 ==========

  /** 健康检查 */
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '2.0.0',
      skills: skillManager?.count || 0,
      memory: memoryStore ? true : false,
      mcp: mcpManager?.count || 0,
      model: getModel(),
    });
  });

  /** 发送消息（同步，非流式）— 用于简单集成 */
  router.post('/chat', async (req, res) => {
    try {
      const { message, sessionId, messages } = req.body;
      if (!message) return res.status(400).json({ code: 400, message: '消息不能为空' });

      const sid = sessionId || uuidv4();
      const { History } = await import('../history.js');
      const history = new History(skillManager, memoryStore, 1000000, workspaceManager);
      // 加载历史消息作为上下文（来自网页端）
      if (messages && Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg.role && msg.content) {
            history.add(msg.role, msg.content);
          }
        }
      }
      history.add('user', message);

      // 调用非流式 LLM
      const data = await callLLM(history.getMessages(), toolDefinitions);
      const choice = data.choices?.[0];
      if (!choice) return res.json({ code: 500, message: 'LLM 未返回有效回复', sessionId: sid });

      const reply = choice.message;

      // 处理工具调用
      if (reply.tool_calls && reply.tool_calls.length > 0) {
        history.addAssistantMessage(reply);
        for (const tc of reply.tool_calls) {
          let args;
          try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
          const result = await executeTool(tc.function.name, args);
          history.addToolResult(tc.id, result);
        }
        // 再次调用 LLM 获取最终回复
        const data2 = await callLLM(history.getMessages(), toolDefinitions);
        let finalContent = data2.choices?.[0]?.message?.content || '';
        // 注入 MiniMax 配额信息
        for (const tc of reply.tool_calls) {
          if (tc.function.name.startsWith('mcp__MiniMax')) {
            try {
              const { QuotaTracker } = await import('../stats/quota-tracker.js');
              const qt = new QuotaTracker();
              const toolName = tc.function.name.split('__').pop();
              const remaining = qt.getRemaining(toolName);
              qt.close();
              finalContent += '\n\n---\n\u{1F4CA} MiniMax \u914D\u989D: \u5269\u4F59 ' + remaining + '/60 \u6B21 (5\u5C0F\u65F6\u6EDA\u52A8)';
            } catch (e) { console.warn('[quota]', e.message); }
            break;
          }
        }
        return res.json({ code: 200, data: { content: finalContent, sessionId: sid, usage: data2.usage } });
      }

      res.json({ code: 200, data: { content: reply.content || '', sessionId: sid, usage: data.usage } });
    } catch (err) {
      res.status(500).json({ code: 500, message: err.message });
    }
  });

  /** 流式聊天 - 建立 SSE 连接 */
  router.post('/chat/stream', async (req, res) => {
    try {
      const { message, sessionId, messages } = req.body;
      if (!message) return res.status(400).json({ code: 400, message: '消息不能为空' });

      const sid = sessionId || uuidv4();

      // 设置 SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      if (!sseClients.has(sid)) sseClients.set(sid, []);
      sseClients.get(sid).push(res);

      // 心跳保活
      const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); } }, 15000);
      sseHeartbeats.set(sid, hb);

      // 监听 res.close 检测客户端断开（不使用 req.on('close')，因为它在请求体接收完毕后就会触发）
      res.on('close', () => {
        const arr = sseClients.get(sid);
        if (arr) {
          const idx = arr.indexOf(res);
          if (idx > -1) arr.splice(idx, 1);
          if (arr.length === 0) cleanupSession(sid);
        }
      });

      // 初始化对话历史
      const { History } = await import('../history.js');
      const history = new History(skillManager, memoryStore, 1000000, workspaceManager);
      // 加载历史消息作为上下文（来自网页端）
      if (messages && Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg.role && msg.content) {
            history.add(msg.role, msg.content);
          }
        }
      }
      history.add('user', message);

      // 发送 sessionId
      res.write(`data: ${JSON.stringify({ type: 'session', sessionId: sid })}\n\n`);

      // 循环处理 LLM + 工具调用（流式版）
      let rounds = 0;
      const MAX_ROUNDS = 999;

      /** 从流式内容中提取推理文本，返回 { content, reasoning } */
      function extractReasoning(raw) {
        const match = raw.match(/^<think>([\s\S]*?)<\/think>\s*/);
        if (match) {
          return { content: raw.slice(match[0].length), reasoning: match[1] };
        }
        return { content: raw, reasoning: '' };
      }

      console.log(`[api-handler] 开始第 1 轮 LLM 调用, model=${getModel()}`);
      while (rounds < MAX_ROUNDS) {
        rounds++;

        // 发送 thinking 事件，表示 AI 开始思考
        pushSSE(sid, { type: 'thinking', data: { round: rounds } });

        // === 流式 LLM 调用 ===
        let streamContent = '';
        const toolAccum = {};
        const toolOrder = [];
        let streamUsage = {};
        const streamStartTime = Date.now();

        await new Promise((resolve, reject) => {
          callLLMStream(history.getMessages(), toolDefinitions, {
            onChunk(text) {
              streamContent += text;
              pushSSE(sid, { type: 'stream', data: { text } });
            },
            onToolCall(tc) {
              const idx = tc.index;
              if (!toolAccum[idx]) {
                toolAccum[idx] = {
                  id: tc.id || `call_${idx}`,
                  type: tc.type || 'function',
                  function: { name: '', arguments: '' },
                };
                toolOrder.push(idx);
              }
              if (tc.function?.name) toolAccum[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolAccum[idx].function.arguments += tc.function.arguments;
            },
            onDone(usage) {
              streamUsage = usage || {};
              resolve();
            },
            onError(err) {
              reject(err);
            },
          });
        });

        // MiniMax 流式 API 不返回 usage，本地估算
        if (!streamUsage.prompt_tokens && !streamUsage.completion_tokens) {
          const inputText = history.getMessages().map(m => {
            if (typeof m.content === 'string') return m.content;
            if (Array.isArray(m.content)) return m.content.map(c => c.text || '').join(' ');
            return '';
          }).join(' ');
          streamUsage.prompt_tokens = Math.ceil(inputText.length / 2);
          streamUsage.completion_tokens = Math.ceil(streamContent.length / 2);
        }

        // 记录 LLM 调用统计到数据库
        try {
          const { trackLLMCall } = await import('../stats/tracker.js');
          trackLLMCall({
            model: getModel(),
            promptTokens: streamUsage.prompt_tokens,
            completionTokens: streamUsage.completion_tokens,
            durationMs: Date.now() - streamStartTime,
          });
        } catch {}

        // 构建工具调用列表
        const roundToolCalls = toolOrder
          .map(i => toolAccum[i])
          .filter(tc => tc.function.name);

        // 思考阶段结束，发送切换信号
        if (streamContent && roundToolCalls.length > 0) {
          pushSSE(sid, { type: 'thinking_end', data: { content: streamContent } });
        }

        // 处理工具调用
        if (roundToolCalls.length > 0) {
          // 构建助理消息（自动分离推理 + 内容，DeepSeek 需要 reasoning_content）
          const { content, reasoning } = extractReasoning(streamContent);
          const assistantMsg = {
            role: 'assistant',
            content: content || null,
            tool_calls: roundToolCalls,
          };
          if (getModel().startsWith('deepseek-v4-flash') && reasoning) {
            assistantMsg.reasoning_content = reasoning.replace(/<\/?think>/g, '');
          }
          history.addAssistantMessage(assistantMsg);

          // 并行执行同一轮所有工具调用
          const toolStartTimes = [];
          for (let i = 0; i < roundToolCalls.length; i++) {
            const tc = roundToolCalls[i];
            const toolStartTime = Date.now();
            toolStartTimes.push(toolStartTime);

            // 先发送所有 tool_call 事件
            pushSSE(sid, {
              type: 'tool_call',
              data: {
                name: tc.function.name,
                args: tc.function.arguments,
                index: i + 1,
                total: roundToolCalls.length,
                timestamp: toolStartTime,
              },
            });
          }

          // 并行执行所有工具
          const toolResults = await Promise.all(roundToolCalls.map((tc, i) => {
            const toolStartTime = toolStartTimes[i];
            let args;
            try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

            // 实时进度计时器
            const progressTimer = setInterval(() => {
              const elapsed = Math.floor((Date.now() - toolStartTime) / 1000);
              if (elapsed > 0) {
                pushSSE(sid, {
                  type: 'tool_progress',
                  data: { name: tc.function.name, elapsed },
                });
              }
            }, 1000);

            return executeTool(tc.function.name, args).then(result => {
              clearInterval(progressTimer);
              const durationMs = Date.now() - toolStartTime;

              // 推送 tool_result 事件
              pushSSE(sid, {
                type: 'tool_result',
                data: {
                  name: tc.function.name,
                  result: result.slice(0, 500),
                  durationMs,
                },
              });

              return { tc, result };
            }).catch(err => {
              clearInterval(progressTimer);
              const durationMs = Date.now() - toolStartTime;
              const errMsg = `错误: ${err.message}`;

              pushSSE(sid, {
                type: 'tool_result',
                data: {
                  name: tc.function.name,
                  result: errMsg.slice(0, 500),
                  durationMs,
                },
              });

              return { tc, result: errMsg };
            });
          }));

          // 按顺序将结果加入历史（保持 LLM 上下文一致性）
          for (const { tc, result } of toolResults) {
            history.addToolResult(tc.id, result);
          }
          continue;
        }

        // 无工具调用，结束
        {
          const { content, reasoning } = extractReasoning(streamContent);
          const finalMsg = { role: 'assistant', content: content || null };
          if (getModel().startsWith('deepseek-v4-flash') && reasoning) {
            finalMsg.reasoning_content = reasoning.replace(/<\/?think>/g, '');
          }
          history.addAssistantMessage(finalMsg);
        }
        pushSSE(sid, { type: 'done', data: { usage: streamUsage } });

        // 保存对话摘要
        if (memoryStore && memoryStore.saveConversationSummary) {
          const lastUser = history.getLastUserMessage();
          const lastAssistant = history.getLastAssistantMessage();
          if (lastUser && lastAssistant) {
            memoryStore.saveConversationSummary(
              `用户: ${lastUser.slice(0, 100)} → 助手: ${lastAssistant.slice(0, 100)}`
            );
          }
        }
        break;
      }
    } catch (err) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', data: { message: err.message } })}\n\n`);
      } catch {}
    }
  });

  /** 获取 SSE 流（用于现有连接重连） */
  router.get('/chat/stream', (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId) return res.status(400).json({ code: 400, message: '缺少 sessionId' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!sseClients.has(sessionId)) sseClients.set(sessionId, []);
    sseClients.get(sessionId).push(res);

    const hb = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); } }, 15000);
    sseHeartbeats.set(sessionId, hb);

    // 监听 res.close 检测客户端断开
    res.on('close', () => {
      const arr = sseClients.get(sessionId);
      if (arr) {
        const idx = arr.indexOf(res);
        if (idx > -1) arr.splice(idx, 1);
        if (arr.length === 0) cleanupSession(sessionId);
      }
    });
  });

  /** 停止执行 */
  router.post('/stop', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
      pushSSE(sessionId, { type: 'stopped', data: {} });
      cleanupSession(sessionId);
    }
    res.json({ code: 200, message: '已停止' });
  });

  /** 获取 Gateway 统计 */
  router.get('/stats', (req, res) => {
    import('../stats/tracker.js').then(({ getStats, getRecentLLM, getRecentTools, getDailyStats }) => {
      res.json({
        activeSSE: sseClients.size,
        skills: skillManager?.count || 0,
        memory: memoryStore?.getAll()?.length || 0,
        mcp: mcpManager?.count || 0,
        stats: getStats(),
        recentLLM: getRecentLLM(10),
        recentTools: getRecentTools(10),
        dailyStats: getDailyStats(14),
      });
    }).catch(() => {
      res.json({
        activeSSE: sseClients.size,
        skills: skillManager?.count || 0,
        memory: memoryStore?.getAll()?.length || 0,
        mcp: mcpManager?.count || 0,
      });
    });
  });

  /** 获取 Canvas 图表数据 */
  router.get('/canvas/:id', (req, res) => {
    import('../canvas/renderer.js').then(({ getCanvas }) => {
      const canvas = getCanvas(req.params.id);
      if (!canvas) return res.status(404).json({ code: 404, message: 'Canvas 未找到' });
      res.json({ code: 200, data: canvas });
    }).catch(() => {
      res.status(500).json({ code: 500, message: 'Canvas 模块加载失败' });
    });
  });

  // ========== 模型切换 API ==========

  /** 获取当前模型 */
  router.get('/current_model', (req, res) => {
    const modelName = getModel();
    const modelKey = modelName === 'MiniMax-M2.7' ? 'minimax' : modelName.startsWith('mimo-v2.5-pro') ? 'mimo' : 'deepseek';
    res.json({ code: 200, data: { model: modelKey, name: modelName } });
  });

  /** 切换模型 */
  router.post('/switch_model', (req, res) => {
    try {
      const { model } = req.body;
      if (!model || !['deepseek', 'minimax', 'mimo'].includes(model)) {
        return res.status(400).json({ code: 400, message: '无效的模型参数，可选: deepseek, minimax, mimo' });
      }

      const modelName = model === 'deepseek' ? 'deepseek-v4-flash[1M]' : model === 'mimo' ? 'mimo-v2.5-pro[1M]' : 'MiniMax-M2.7';
      const currentModel = getModel();
      if (currentModel === modelName) {
        return res.json({ code: 200, message: `当前已经是 ${modelName}`, model: modelName });
      }

      // 更新 .env 文件
      let envContent = fs.readFileSync(ENV_PATH, 'utf-8');
      if (envContent.includes('MODEL=')) {
        envContent = envContent.replace(/^MODEL=.*$/m, `MODEL=${modelName}`);
      } else {
        envContent += `\nMODEL=${modelName}\n`;
      }
      fs.writeFileSync(ENV_PATH, envContent, 'utf-8');

      // 更新内存中的模型配置
      setModel(modelName);

      console.log(`[switch_model] 模型已切换至: ${modelName}`);
      res.json({ code: 200, message: `已切换至 ${modelName}`, model: modelName });
    } catch (err) {
      console.error(`[switch_model] 切换失败: ${err.message}`);
      res.status(500).json({ code: 500, message: `切换失败: ${err.message}` });
    }
  });

  return router;
}
