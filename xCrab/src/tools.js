/**
 * xCrab 工具定义与执行
 * 每个工具包含定义 (schema) 和执行函数 (handler)
 */

// --- 工具定义（OpenAI 兼容格式）---
export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: '获取当前日期和时间',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区，例如 Asia/Shanghai、America/New_York',
            default: 'Asia/Shanghai',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行数学计算',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '数学表达式，如 "1 + 2 * 3" 或 "sqrt(16)"',
          },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'weather',
      description: '获取指定城市的当前天气（模拟数据）',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称',
          },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网获取最新信息',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: '加载一个已安装技能的完整指令内容。当用户请求与某个技能描述匹配时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '技能名称',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_skills',
      description: '从 ClawHub 技能市场搜索可安装的技能',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'install_skill',
      description: '从 ClawHub 安装一个技能',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '技能名称（slug）',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'uninstall_skill',
      description: '卸载一个已安装的技能',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '技能名称',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: '在服务器环境中执行任意 shell 命令（Linux bash / Windows cmd）。可用于：文件操作、系统管理、安装软件包（apt/yum/brew/npm）、运行脚本、调用 CLI 工具、处理进程等。注意：命令会阻塞直到完成，长时间运行的命令请设置合适的 timeout。',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '要执行的 shell 命令',
          },
          timeout: {
            type: 'number',
            description: '超时时间（毫秒），默认 1200000（20 分钟）',
          },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: '记住关于用户的信息（键值对），下次对话时会 recall。例如用户说"我叫张三"，就存储 key="user_name", value="张三"',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '信息的键名，如 user_name、user_city、preferred_language',
          },
          value: {
            type: 'string',
            description: '信息的 value',
          },
          category: {
            type: 'string',
            description: '分类：user_info（用户信息）、preference（偏好）、fact（事实）',
            enum: ['user_info', 'preference', 'fact', 'general'],
          },
          level: {
            type: 'string',
            description: '记忆层级：mid（中期，跨会话）、long（长期，重要信息）',
            enum: ['mid', 'long'],
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: '搜索与关键词相关的历史记忆。当用户问"你还记得我...吗"或需要从记忆中查找信息时使用。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索关键词，如用户的姓名、喜好、之前提到的话题等',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description: '删除一条或多条记忆。当用户要求忘记某些信息、或你发现记忆过时/错误时使用。支持按 key 精确删除或按 query 搜索后删除。',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: '要删除的记忆 key（精确匹配），与 query 二选一',
          },
          query: {
            type: 'string',
            description: '搜索关键词，将删除匹配到的所有记忆，与 key 二选一',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: '将复杂任务自动拆解为多个子步骤并按序执行。当用户请求涉及多步操作（如查天气+算数、搜索+分析）时使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: '要完成的任务描述',
          },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'configure_skill',
      description: '查看或修改已安装技能的配置',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: '操作类型：get（查看配置）、set（修改配置）',
            enum: ['get', 'set'],
          },
          skill: {
            type: 'string',
            description: '技能名称',
          },
          key: {
            type: 'string',
            description: '配置键名（仅 set 时需要）',
          },
          value: {
            type: 'string',
            description: '配置值（仅 set 时需要）',
          },
        },
        required: ['action', 'skill'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_workspace',
      description: '切换到指定的工作区（角色/人格），切换后你的身份和行为将随之改变。当用户要求你扮演不同角色时使用此工具',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '工作区名称，如 "main"（默认）或其他已创建的角色名称',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_workspaces',
      description: '列出所有可用的工作区（角色/人格）及其描述',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_canvas',
      description: '创建可视化图表。当用户要求生成图表、可视化数据、趋势图、统计图时使用。支持柱状图(bar)、折线图(line)、饼图(pie)、表格(table)',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '图表类型：bar（柱状图）、line（折线图）、pie（饼图）、table（表格）',
            enum: ['bar', 'line', 'pie', 'table'],
          },
          title: {
            type: 'string',
            description: '图表标题',
          },
          data: {
            type: 'object',
            description: '图表数据。bar/line 格式: { labels: string[], datasets: [{ label: string, values: number[] }] }。pie 格式: { labels: string[], values: number[] }。table 格式: { headers: string[], rows: string[][] }',
          },
        },
        required: ['type', 'data'],
      },
    },
  },
  // --- 文件操作工具 ---
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取指定文件的内容。支持文本文件和指定编码的文件。自动限制最大读取大小防止内存溢出。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，可以是绝对路径或相对于工作区的相对路径' },
          encoding: { type: 'string', description: '文件编码，默认 utf-8', default: 'utf-8' },
          maxBytes: { type: 'number', description: '最大读取字节数，默认 65536 (64KB)，超过部分截断', default: 65536 },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '将内容写入指定文件。如果文件不存在则自动创建（包括中间目录），已存在则覆盖。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，可以是绝对路径或相对于工作区的相对路径' },
          content: { type: 'string', description: '要写入的文件内容' },
          encoding: { type: 'string', description: '文件编码，默认 utf-8', default: 'utf-8' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_file',
      description: '将内容追加到指定文件末尾。如果文件不存在则创建。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '要追加的内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出指定目录下的文件和子目录信息（名称、大小、修改时间、类型）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，默认当前工作目录', default: '.' },
          recursive: { type: 'boolean', description: '是否递归列出所有子目录内容', default: false },
        },
        required: [],
      },
    },
  },
  // --- 网络工具 ---
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: '获取任意 URL 的内容（HTML/JSON/纯文本/图片二进制等），用于访问网页 API、下载文件、抓取页面数据。支持自定义请求头、POST 请求和超时设置。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要获取的完整 URL（必须以 http:// 或 https:// 开头）' },
          method: { type: 'string', description: 'HTTP 方法', enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'GET' },
          headers: { type: 'object', description: '自定义请求头（可选），如 { "Authorization": "Bearer xxx" }' },
          body: { type: 'string', description: '请求体内容（POST/PUT 时需要），如 JSON 字符串或表单数据' },
          timeout: { type: 'number', description: '超时时间（毫秒），默认 60000（60 秒）', default: 60000 },
          responseType: { type: 'string', description: '响应类型：text（文本）、json（自动解析 JSON）、base64（二进制），默认 text', enum: ['text', 'json', 'base64'], default: 'text' },
        },
        required: ['url'],
      },
    },
  },
];

// --- 工具执行 ---

/** @type {import('./skill-manager.js').SkillManager} */
let _skillManager = null;

/** @type {import('./memory/store.js').MemoryStore} */
let _memoryStore = null;

/** @type {import('./mcp/client.js').MCPManager} */
let _mcpManager = null;

/** @type {import('./workspace/manager.js').WorkspaceManager} */
let _workspaceManager = null;

/** @type {Function|null} */
let _onToolProgress = null;

/** @type {import('./stats/quota-tracker.js').QuotaTracker|null} */
let _quotaTracker = null;

/**
 * 设置 QuotaTracker 实例，用于 MiniMax 工具配额监控
 * @param {import('./stats/quota-tracker.js').QuotaTracker|null} qt
 */
export function setQuotaTracker(qt) {
  _quotaTracker = qt;
}


/**
 * 设置工具进度回调，工具执行 start/end/error 时会触发
 * @param {Function|null} cb - (toolName, { type, args, result, duration, error }) => void
 */
export function setToolProgressCallback(cb) {
  _onToolProgress = cb;
}

/**
 * 设置 SkillManager 实例，供工具使用
 */
export function setSkillManager(sm) {
  _skillManager = sm;
}

/**
 * 设置 MemoryStore 实例，供工具使用
 */
export function setMemoryStore(ms) {
  _memoryStore = ms;
}

/**
 * 设置 MCPManager 实例，供工具路由使用
 */
export function setMCPManager(mm) {
  _mcpManager = mm;
}

/**
 * 设置 WorkspaceManager 实例，供工具使用
 */
export function setWorkspaceManager(wm) {
  _workspaceManager = wm;
}

/**
 * 将 MCP 工具合并到 toolDefinitions 中
 * @param {Array} mcpTools - MCP 服务器返回的工具列表（已格式化）
 */
export function addMcpTools(mcpTools) {
  if (!mcpTools || mcpTools.length === 0) return;
  // 移除已有的旧 MCP 工具定义
  const existing = toolDefinitions.filter(t => !t.function.name.startsWith('mcp__'));
  toolDefinitions.length = 0;
  toolDefinitions.push(...existing, ...mcpTools);
}

async function getTime(args) {
  const tz = args.timezone || 'Asia/Shanghai';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `当前时间 (${tz}): ${formatter.format(now)}`;
}

function calculate(args) {
  const expr = args.expression;
  try {
    const sanitized = expr.replace(/[^0-9+\-*/.()%\s,]/g, '');
    const fn = new Function(`return (${sanitized})`);
    const result = fn();
    return `${expr} = ${result}`;
  } catch {
    return `无法计算: ${expr}`;
  }
}

async function weather(args) {
  const city = args.city;
  const conditions = ['晴朗', '多云', '阴天', '小雨', '微风'];
  const cond = conditions[Math.floor(Math.random() * conditions.length)];
  const temp = Math.round(10 + Math.random() * 25);
  return `${city} 天气：${cond}，${temp}°C，湿度 ${Math.round(40 + Math.random() * 40)}%`;
}

async function webSearch(args) {
  const query = args.query;
  try {
    const resp = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
    );
    const data = await resp.json();
    const results = data.AbstractText || data.RelatedTopics?.slice(0, 3).map(t =>
      t.Text || t.Result
    ).filter(Boolean).join('\n') || '未找到相关结果。';
    return results;
  } catch {
    return `搜索 "${query}" 时出现网络错误。`;
  }
}

function readSkill(args) {
  if (!_skillManager) return '错误：SkillManager 未初始化';
  const content = _skillManager.getSkillContent(args.name);
  if (!content) {
    return `技能 "${args.name}" 未找到。已安装技能: ${_skillManager.getSummaryList().map(s => s.name).join(', ')}`;
  }
  return `技能 "${args.name}" 指令:\n\n${content}`;
}

async function searchSkillsClawHub(args) {
  const { searchSkills } = await import('./clawhub.js');
  try {
    const results = await searchSkills(args.query);
    if (!results || results.length === 0) return '未找到相关技能。';
    return results.slice(0, 10).map((s, i) =>
      `${i + 1}. ${s.name || s.slug} — ${s.description || '无描述'} (⬇️ ${s.downloads || 0})`
    ).join('\n');
  } catch (err) {
    return `搜索技能失败: ${err.message}`;
  }
}

async function installSkill(args) {
  const { installSkill: doInstall } = await import('./clawhub.js');
  try {
    const result = await doInstall(args.name);
    if (_skillManager) {
      _skillManager.loadAll();
    }
    return `技能 "${result.name}" 已安装到: ${result.dir}`;
  } catch (err) {
    return `安装技能失败: ${err.message}`;
  }
}

function uninstallSkill(args) {
  if (!_skillManager) return '错误：SkillManager 未初始化';
  try {
    const result = _skillManager.uninstall(args.name);
    if (result.includes('未找到')) {
      return `卸载失败：技能 "${args.name}" 未找到`;
    }
    _skillManager.loadAll();
    return `✅ 技能 "${args.name}" 已卸载`;
  } catch (err) {
    return `卸载技能失败: ${err.message}`;
  }
}

function remember(args) {
  if (!_memoryStore) return '记忆系统未启用（ENABLE_MEMORY=false）';
  _memoryStore.save(args.key, args.value, args.category || 'general', args.level || 'mid');
  const levelLabel = args.level === 'long' ? '（长期记忆）' : '';
  return `已记住${levelLabel}: ${args.key} = ${args.value}`;
}

function recall(args) {
  if (!_memoryStore) return '记忆系统未启用（ENABLE_MEMORY=false）';
  const results = _memoryStore.search(args.query);
  if (results.length === 0) return '未找到相关记忆。';
  return results.map((r, i) =>
    `${i + 1}. ${r.key}: ${r.value} (${r.category || 'general'})`
  ).join('\n');
}

function forget(args) {
  if (!_memoryStore) return '记忆系统未启用（ENABLE_MEMORY=false）';

  if (args.key) {
    if (!_memoryStore.exists(args.key)) return `未找到 key 为 "${args.key}" 的记忆。`;
    _memoryStore.remove(args.key);
    return `已删除记忆: ${args.key}`;
  }

  if (args.query) {
    const results = _memoryStore.search(args.query);
    if (results.length === 0) return `未找到与 "${args.query}" 相关的记忆。`;
    const toDelete = results.slice(0, 10);
    const deleted = [];
    for (const r of toDelete) {
      _memoryStore.remove(r.key);
      deleted.push(r.key);
    }
    const suffix = results.length > 10 ? `（仅删除前 10 条，共匹配 ${results.length} 条）` : '';
    return `已删除 ${deleted.length} 条记忆: ${deleted.join(', ')}${suffix}`;
  }

  return '请提供 key 或 query 参数来指定要删除的记忆。';
}

async function runCommand(args) {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  const cmd = args.command;
  const timeout = args.timeout || 1200000;

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB
      windowsHide: true,
    });
    let result = stdout ? `输出:\n${stdout.slice(0, 2000)}` : '';
    if (stderr) result += `\n错误输出:\n${stderr.slice(0, 1000)}`;
    return result || '命令执行完成（无输出）';
  } catch (err) {
    return `命令执行失败 (${err.code || err.signal}): ${err.message.slice(0, 500)}`;
  }
}

async function createPlan(args) {
  const { Planner } = await import('./planner.js');
  const { callLLM } = await import('./llm.js');

  // 排除 create_plan 自身，防止递归
  const toolNames = toolDefinitions
    .map(t => t.function.name)
    .filter(n => n !== 'create_plan');
  const planner = new Planner(callLLM);

  return planner.run(args.task, toolNames, executeTool);
}

function configureSkill(args) {
  if (!_skillManager) return '错误：SkillManager 未初始化';
  if (args.action === 'get') {
    const config = _skillManager.getConfig(args.skill);
    if (config === null) return `技能 "${args.skill}" 未找到`;
    return `技能 "${args.skill}" 配置:\n${
      Object.entries(config).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    }`;
  } else if (args.action === 'set') {
    if (!args.key || args.value === undefined) return '请提供 key 和 value';
    return _skillManager.setConfig(args.skill, args.key, args.value);
  }
  return '未知操作，请使用 get 或 set';
}

async function renderCanvas(args) {
  const { type, title, data } = args;
  const { saveCanvas, getCanvasRef } = await import('./canvas/renderer.js');
  const { renderChart } = await import('./canvas/chart-cli.js');

  const result = saveCanvas(type, data, title);
  if (result.error) return `创建图表失败: ${result.error}`;

  const canvas = { id: result.id, type, title: title || '', data };
  const chartText = renderChart(canvas);
  const ref = getCanvasRef(result.id);

  return `📊 图表已创建\n${chartText}\n${ref}`;
}

function switchWorkspace(args) {
  if (!_workspaceManager) return '错误：Workspace 系统未初始化';
  const result = _workspaceManager.switchWorkspace(args.name);
  if (result.success) {
    return `✅ 已切换到工作区 "${args.name}"。请重新发送消息以应用新的人格设定。`;
  }
  return `❌ ${result.error}`;
}

function listWorkspaces() {
  if (!_workspaceManager) return '错误：Workspace 系统未初始化';
  const list = _workspaceManager.listWorkspaces();
  if (list.length === 0) return '暂无可用工作区';
  const active = _workspaceManager.activeName;
  return list.map(ws =>
    `${ws.name === active ? '▶ ' : '  '}${ws.name} — ${ws.desc} (${ws.fileCount} 文件)${ws.name === active ? ' [当前]' : ''}`
  ).join('\n');
}

// --- 文件操作工具实现 ---

async function readFile(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path);
  const maxBytes = args.maxBytes || 65536;

  try {
    const stat = fs.default.statSync(targetPath);
    if (!stat.isFile()) return `错误: "${args.path}" 不是一个文件`;
    if (stat.size > maxBytes * 2) {
      const fd = fs.default.openSync(targetPath, 'r');
      const buffer = Buffer.alloc(maxBytes);
      fs.default.readSync(fd, buffer, 0, maxBytes, 0);
      fs.default.closeSync(fd);
      const content = buffer.toString(args.encoding || 'utf-8');
      return `${content}\n\n... [文件总大小 ${formatSize(stat.size)}，仅显示前 ${formatSize(maxBytes)}]`;
    }
    const content = fs.default.readFileSync(targetPath, args.encoding || 'utf-8');
    return content || '(空文件)';
  } catch (err) {
    if (err.code === 'ENOENT') return `错误: 文件 "${args.path}" 不存在`;
    if (err.code === 'EACCES') return `错误: 没有权限读取 "${args.path}"`;
    return `读取文件失败: ${err.message}`;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function writeFile(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path);

  try {
    // 确保父目录存在
    const dir = path.default.dirname(targetPath);
    if (!fs.default.existsSync(dir)) {
      fs.default.mkdirSync(dir, { recursive: true });
    }
    fs.default.writeFileSync(targetPath, args.content, args.encoding || 'utf-8');
    return `✅ 文件已写入: ${args.path} (${formatSize(Buffer.byteLength(args.content, args.encoding || 'utf-8'))})`;
  } catch (err) {
    if (err.code === 'EACCES') return `错误: 没有权限写入 "${args.path}"`;
    if (err.code === 'ENOSPC') return '错误: 磁盘空间不足';
    return `写入文件失败: ${err.message}`;
  }
}

async function appendFile(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path);

  try {
    const dir = path.default.dirname(targetPath);
    if (!fs.default.existsSync(dir)) {
      fs.default.mkdirSync(dir, { recursive: true });
    }
    fs.default.appendFileSync(targetPath, args.content, 'utf-8');
    return `✅ 内容已追加到: ${args.path}`;
  } catch (err) {
    return `追加文件失败: ${err.message}`;
  }
}

async function listFiles(args) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const targetPath = path.default.resolve(args.path || '.');

  try {
    if (!fs.default.existsSync(targetPath)) return `错误: 目录 "${args.path || '.'}" 不存在`;
    const stat = fs.default.statSync(targetPath);
    if (!stat.isDirectory()) {
      return `"${args.path || '.'}" 是一个文件\n  大小: ${formatSize(stat.size)}\n  修改时间: ${stat.mtime.toLocaleString('zh-CN')}`;
    }

    const entries = fs.default.readdirSync(targetPath, { withFileTypes: true });
    if (entries.length === 0) return '(空目录)';

    let result = `📁 ${args.path || '.'} (${entries.length} 项):\n`;
    for (const entry of entries) {
      const fullPath = path.default.join(targetPath, entry.name);
      try {
        const st = fs.default.statSync(fullPath);
        const sizeStr = entry.isDirectory() ? '' : ` ${formatSize(st.size)}`;
        const timeStr = st.mtime.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        result += `  ${entry.isDirectory() ? '📁' : '📄'} ${entry.name}${sizeStr} (${timeStr})\n`;
      } catch {
        result += `  ${entry.isDirectory() ? '📁' : '📄'} ${entry.name}\n`;
      }
    }

    if (args.recursive) {
      result += '\n--- 递归子目录 ---\n';
      function walkDir(dirPath, indent) {
        let subEntries = [];
        try {
          subEntries = fs.default.readdirSync(dirPath, { withFileTypes: true });
        } catch { return ''; }
        let out = '';
        for (const e of subEntries) {
          if (e.name.startsWith('.') || e.name === 'node_modules') continue;
          const fp = path.default.join(dirPath, e.name);
          try {
            const st = fs.default.statSync(fp);
            out += `${indent}${e.isDirectory() ? '📁' : '📄'} ${e.name}${e.isDirectory() ? '/' : ` ${formatSize(st.size)}`}\n`;
            if (e.isDirectory()) out += walkDir(fp, indent + '  ');
          } catch {}
        }
        return out;
      }
      result += walkDir(targetPath, '');
    }

    return result;
  } catch (err) {
    if (err.code === 'EACCES') return `错误: 没有权限访问 "${args.path || '.'}"`;
    return `列出目录失败: ${err.message}`;
  }
}

// --- 网络工具实现 ---

async function webFetch(args) {
  const url = args.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return '错误: URL 必须以 http:// 或 https:// 开头';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeout || 30000);

  try {
    const fetchOpts = {
      method: args.method || 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'xCrab-AI-Agent/1.0', ...(args.headers || {}) },
    };
    if (args.body && (args.method === 'POST' || args.method === 'PUT')) {
      fetchOpts.body = args.body;
      if (!fetchOpts.headers['Content-Type'] && !fetchOpts.headers['content-type']) {
        fetchOpts.headers['Content-Type'] = 'application/json';
      }
    }

    const resp = await fetch(url, fetchOpts);
    clearTimeout(timeoutId);

    const responseType = args.responseType || 'text';
    let content;
    let sizeInfo = '';

    if (responseType === 'json') {
      content = JSON.stringify(await resp.json(), null, 2);
      sizeInfo = ` (${formatSize(Buffer.byteLength(content))})`;
    } else if (responseType === 'base64') {
      const buffer = await resp.arrayBuffer();
      content = Buffer.from(buffer).toString('base64');
      sizeInfo = ` (${formatSize(buffer.byteLength)}, base64 编码)`;
    } else {
      content = await resp.text();
      sizeInfo = ` (${formatSize(Buffer.byteLength(content))})`;
      if (content.length > 10000) {
        content = content.slice(0, 10000) + `\n\n... [响应过长，仅显示前 10000 字符，共 ${content.length} 字符]`;
      }
    }

    const headers = `HTTP ${resp.status} ${resp.statusText} | Content-Type: ${resp.headers.get('content-type') || 'N/A'}${sizeInfo}`;
    return `📡 ${url}\n${headers}\n\n${content}`;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') return `请求超时: ${url}`;
    if (err.cause?.code === 'ENOTFOUND' || err.cause?.code === 'ECONNREFUSED') {
      return `无法连接到服务器: ${url} (${err.cause.code})`;
    }
    return `网络请求失败: ${err.message}`;
  }
}

/** 工具名称 → 执行函数 映射 */
const handlers = {
  get_time: getTime,
  calculate,
  weather,
  web_search: webSearch,
  read_skill: readSkill,
  search_skills: searchSkillsClawHub,
  install_skill: installSkill,
  uninstall_skill: uninstallSkill,
  run_command: runCommand,
  remember,
  recall,
  forget,
  create_plan: createPlan,
  configure_skill: configureSkill,
  render_canvas: renderCanvas,
  switch_workspace: switchWorkspace,
  list_workspaces: listWorkspaces,
  read_file: readFile,
  write_file: writeFile,
  append_file: appendFile,
  list_files: listFiles,
  web_fetch: webFetch,
};

/** 解析 MCP 工具名格式 mcp__serverId__toolName */
function parseMcpToolName(fullName) {
  const parts = fullName.split('__');
  if (parts.length >= 3 && parts[0] === 'mcp') {
    return { serverId: parts[1], toolName: parts.slice(2).join('__') };
  }
  return null;
}

/**
 * 执行工具调用
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<string>}
 */
export async function executeTool(toolName, args) {
  const startTime = Date.now();

  // 通知工具执行开始
  if (_onToolProgress) {
    try { _onToolProgress(toolName, { type: 'start', args }); } catch {}
  }

  // 检查是否是 MCP 工具调用
  const mcpInfo = _mcpManager ? parseMcpToolName(toolName) : null;

  try {
    let result;
    if (mcpInfo) {
      // 配额检查：MiniMax MCP 工具
      if (mcpInfo.serverId === 'MiniMax' && _quotaTracker) {
        const quota = _quotaTracker.checkQuota(mcpInfo.toolName);
        if (!quota.allowed) {
          result = quota.message;
          console.warn('[配额]', quota.message);
          _quotaTracker.recordCall(mcpInfo.toolName);
        } else {
          result = await _mcpManager.executeTool(mcpInfo.serverId, mcpInfo.toolName, args);
          _quotaTracker.recordCall(mcpInfo.toolName);
          // 在结果末尾附加剩余配额信息
          const remaining = _quotaTracker.getRemaining(mcpInfo.toolName);
        }
      } else {
        result = await _mcpManager.executeTool(mcpInfo.serverId, mcpInfo.toolName, args);
      }
    } else {
      const handler = handlers[toolName];
      if (!handler) {
        result = `错误：未知工具 "${toolName}"`;
      } else {
        result = await handler(args);
      }
    }

    // 通知工具执行完成
    if (_onToolProgress) {
      try { _onToolProgress(toolName, { type: 'end', result, duration: Date.now() - startTime }); } catch {}
    }

    // 追踪统计
    trackToolCallStat(toolName, true, Date.now() - startTime);
    return String(result);
  } catch (err) {
    // 通知工具执行失败
    if (_onToolProgress) {
      try { _onToolProgress(toolName, { type: 'error', error: err.message, duration: Date.now() - startTime }); } catch {}
    }

    trackToolCallStat(toolName, false, Date.now() - startTime, err.message);
    return `工具 "${toolName}" 执行出错: ${err.message}`;
  }
}

/** 工具调用统计（异步，不影响主流程）*/
function trackToolCallStat(toolName, success, durationMs, error) {
  import('./stats/tracker.js').then(({ trackToolCall }) => {
    try { trackToolCall({ toolName, success, durationMs, error }); } catch {}
  }).catch(() => {});
}
