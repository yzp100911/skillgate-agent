# MEMORY.md - Long-Term Memory

_Curated wisdom, not raw logs._

## 2026-05-06

### Proactive Agent 初始化

安装了 Proactive Agent (v3.1.0) 和 Skill Vetter 两个 skill。
Proactive Agent 的文件已就位：ONBOARDING.md 等待填写，后续需要创建 SESSION-STATE.md 来作为 WAL 协议的目标文件。

### agent-browser 浏览器自动化技巧

操作 SPA 登录页面时：
- 隐私弹窗需先用 CDP JS 关闭再操作
- click 命令对 Vue 表单不灵，改用 CDP JS `element.click()`
- 侧边栏菜单在无障碍快照中不可见，通过 CDP JS 扫 DOM 的 href 定位
- 详情记录在 `.learnings/LEARNINGS.md`

### 默认浏览器自动化工具：playwright-cli

**2026-05-09 决策：优先使用 playwright-cli，而非 agent-browser。**

原因：
- playwright-cli 比 agent-browser 快约 20 秒（测试莞e租系统）
- check/click 勾选框是单步操作，不需要 JS eval 绕过 iframe
- snapshot 无障碍树更完整，tooltip 弹层直接可见
- 命令更简洁直观

安装路径：`/www/server/nodejs/v22.22.2/bin/playwright-cli`（已做 symlink 到 /usr/local/bin）
版本：0.1.13
常用命令：`playwright-cli open <url>` / `playwright-cli snapshot` / `playwright-cli click @eN` / `playwright-cli fill @eN <text>`

## 2026-05-08

### 泽平的聊天页面项目

项目路径：`/www/wwwroot/eclaw/wclaw/`

这是我和你（泽平）当前聊天页面的前端源码目录。
包含：app.js、app-auth.js、app-base.js、app-main.js 等模块，以及 index.html、styles.css 等资源文件。

### 莞e租系统查询（agent-browser）

完整流程记录在 `.learnings/莞e租系统查询流程.md`

**常用账号：**
- 18122859721 / 100911yzp@（有米公寓一栋）
- 18926879306 / 100911yzpYZP（有米公寓，房源更多）

**注意：** 两个账号密码不同，18926879306的密码末尾是`YZP`


## 2026-05-08

### 微信插件安装记录

微信插件：`@tencent-weixin/openclaw-weixin@2.4.2`
已通过 `npx -y @tencent-weixin/openclaw-weixin-cli@latest install` 安装。

**关键踩坑：**
- QR 码有效期很短，扫码进程要保持存活，每次都要重新生成
- 扫码成功后登录信息保存在 `channels.openclaw-weixin` 配置中
- `plugins.allow` 必须包含 `openclaw-weixin` 才能加载
- **coordinator 模型用 `custom-001/deepseek-v4-flash` 会 401 报错，必须用 `minimax/MiniMax-M2.7`**
- Gateway 用 `nohup ... &` 启动会被 SIGTERM 杀掉，用 `tmux new-session -d` 才能稳定运行

**当前状态：** 微信已连接，账号 `20af5673c594-im-bot`，Gateway 在 tmux session `wx` 中运行。

## 2026-05-10

### CloakBrowser 默认浏览器策略

**决策：如果页面被验证码/环境异常拦截，默认使用 CloakBrowser 打开。**

原因：CloakBrowser 是基于修改了 C++ 源代码的 Chromium，内置49个反检测补丁，能绕过微信、Cloudflare 等平台的机器人检测，无需验证码。

**使用方法：**
```javascript
// Node.js ESM 方式
import { launch } from '/www/server/nodejs/v22.22.2/lib/node_modules/cloakbrowser/dist/index.js';

const browser = await launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://blocked-site.com');
await page.screenshot({ path: 'screenshot.png' });
await browser.close();
```

**关键信息：**
- npm全局包：`/www/server/nodejs/v22.22.2/lib/node_modules/cloakbrowser`
- Chromium路径：`/root/.cloakbrowser/chromium-146.0.7680.177.x/chrome`
- playwright-core 需要同时安装才能运行
- 首次运行会自动下载二进制文件（~200MB）

## 2026-05-11

### 微信 ClawBot 修复（Gateway token 不同步）

**问题现象：**
- `openclaw channels status` 显示 "Channel is unavailable: openclaw-weixin"
- 微信插件 errcode -14 (session timeout)
- Gateway 可达但 CLI 报告 unauthorized

**根因：**
OpenClaw 有两个配置路径：
- Gateway 读取：`/root/.openclaw/openclaw.json`（systemd 服务用）
- CLI 读取：`/opt/cclaw-client/UbuntuClaw/cclaw/data/openclaw.json`（环境变量 OPENCLAW_CONFIG_PATH）

两个配置文件的 `gateway.auth.token` 必须一致。修复后发现 CLI 配置缺少 token。

**修复步骤：**
1. 清理旧账号：`echo '[]' > /root/.openclaw/openclaw-weixin/accounts.json`
2. 删除 credentials 文件
3. 重启 Gateway（清除 session-guard 进程内存中的 60 分钟暂停）
4. 启动 QR 登录：`tmux new-session -d -s wechat-login "openclaw channels login --channel openclaw-weixin"`
5. **关键：把 token 写入 CLI 配置**（两处都要有）

```bash
# 验证 token 是否一致
cat /root/.openclaw/openclaw.json | python3 -c "import json,sys; print(json.load(sys.stdin)['gateway']['auth']['token'])"
cat /opt/cclaw-client/UbuntuClaw/cclaw/data/openclaw.json | python3 -c "import json,sys; print(json.load(sys.stdin)['gateway']['auth']['token'])"
```

**当前账号：**
- 账号 ID：`ed9fdc2495f0-im-bot`
- 微信 userId：`o9cq802dCUlbYIrFHu3-NkzTM0xk@im.wechat`
- token 存储：`/root/.openclaw/openclaw-weixin/accounts/ed9fdc2495f0-im-bot.json`

**微信插件架构（来自公众号文章）：**
- 长轮询机制（插件主动轮询微信服务器，不需要公网暴露）
- errcode -14 = session expired，需要重新扫码登录
- session-guard.js 固定暂停 60 分钟（进程内存，Gateway 重启后清空）
