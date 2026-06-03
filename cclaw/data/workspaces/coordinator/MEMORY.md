# 浏览器自动化记录

## 案例：莞e租管理系统 - 查询房源428租期

### 网站信息
- **网址：** https://gez.dongguanbank.cn/landlord/#/house/index
- **账号：** 18926879306
- **密码：** 100911yzpYZP
- **功能：** 房东管理房源、租约、账务的系统

### 操作流程

1. **打开登录页**
   ```
   agent-browser open "https://gez.dongguanbank.cn/landlord/#/house/index"
   ```

2. **同意隐私协议（弹窗）**
   - 先点击"同意并授权"按钮
   ```
   agent-browser click @e5
   ```

3. **填写登录信息**
   ```
   agent-browser fill @e10 "18926879306"
   agent-browser fill @e11 "100911yzpYZP"
   ```

4. **勾选记住登录 + 点击登录**
   ```
   agent-browser check @e7
   agent-browser click @e2
   agent-browser wait --load networkidle
   ```

5. **进入"房源"页面**
   ```
   agent-browser click @e27
   ```

6. **在"有米公寓（南城沙苑市场）"下搜索"428"**
   - 点击楼盘选择器，选中有米公寓
   - 在搜索框（房型/房间/住户名称）输入"428"
   - 回车或等待结果加载

7. **点击428房间查看详情**
   - 点击房间名称进入详情页

8. **点击"租约详情"**
   ```
   agent-browser click @e58  # "租约详情"按钮
   ```

9. **查看当前租约信息**
   - 找到最新签约记录（第4次签约）
   - 租期：2026/03/01 - 2026/05/31

### 关键元素引用规则
- 每次 `snapshot -i` 后 refs（@e1/@e2/...）会**重新生成**
- 操作任何会改变页面的动作（点击、输入）后**必须重新 snapshot**
- 等待用 `wait --load networkidle` 而非固定 sleep

### agent-browser 常用命令速查

| 操作 | 命令 |
|------|------|
| 打开页面 | `agent-browser open <url>` |
| 截图（交互元素） | `agent-browser snapshot -i` |
| 点击 | `agent-browser click @eN` |
| 填写输入框 | `agent-browser fill @eN "文字"` |
| 回车 | `agent-browser press Enter` |
| 等待加载 | `agent-browser wait --load networkidle` |
| 等待元素出现 | `agent-browser wait @eN` |
| 勾选 | `agent-browser check @eN` |
| 截图保存 | `agent-browser screenshot <文件名>` |
| 关闭浏览器 | `agent-browser close` |

### 相关SKILL文件
- `~/.agents/skills/agent-browser/SKILL.md`
- `agent-browser skills get core --full` 查看完整文档

---

# 反爬虫与隐身浏览器

## 背景问题

普通自动化浏览器（Playwright/agent-browser）访问反爬严格的网站时会被拦截，常见表现：
- 弹出验证码（滑动拼图、点选等）
- 显示"环境异常"
- 直接拒绝访问（HTTP 403 / 验证码页）

根本原因：网站通过 **浏览器指纹检测**（Canvas、WebGL、navigator.webdriver、自动化信号等）识别出是机器访问。

## 解决方案一：CloakBrowser（推荐）

### 介绍
CloakBrowser 是源码级修改的 Chromium，内置 49 个 C++ 补丁覆盖：
- Canvas / WebGL 指纹
- Audio 指纹
- Fonts / GPU 渲染
- Screen / viewport
- WebRTC IP 泄漏
- 网络时序
- navigator.webdriver 等自动化信号

### 安装
```bash
pip install cloakbrowser
```

### 下载 Chromium 二进制（需要设置镜像）
服务器访问 GitHub 慢，设置代理镜像：
```bash
export CLOAKBROWSER_DOWNLOAD_URL="https://gh-proxy.com/https://github.com/CloakHQ/CloakBrowser/releases/download"
python3 -c "from cloakbrowser import launch; b = launch(headless=True); b.close()"
```

### 使用示例
```python
from cloakbrowser import launch

b = launch(headless=True)  # headless=True 静默模式
page = b.new_page()
page.goto('https://example.com')  # 直接访问，无验证码
content = page.inner_text('body')
b.close()
```

### 关键参数
- `headless=True/False` — 是否无头
- `proxy="http://user:pass@proxy:8080"` — 代理支持
- `timezone="Asia/Shanghai"` — 时区设置
- `humanize=True` — 模拟真人鼠标曲线、键盘时序（需额外依赖）

### 验证效果
普通 Playwright 被识别的特征 → CloakBrowser 伪装情况：
- WebGL 渲染器：SwiftShader（虚拟）→ **真实显卡**（RTX 4060）
- navigator.webdriver：true → **false**
- reCAPTCHA v3 得分：0.1 → **0.9**

### 适用场景
- Cloudflare Turnstile 验证页
- FingerprintJS 等指纹检测网站
- 微信公众号文章（mp.weixin.qq.com）
- 其他强反爬网站

### 限制
- **不解决滑动验证码**（拼图位置随机，需真人操作）
- **不解决 IP 层面的封锁**（微信对服务器 IP 整体封禁，需代理）

---

## 常见反爬技术一览

| 技术 | 检测方式 | 对策 |
|------|---------|------|
| navigator.webdriver | JS 检测 window.webdriver | CloakBrowser C++ 补丁 |
| Canvas 指纹 | 渲染矢量图形取 hash | CloakBrowser 噪声注入 |
| WebGL 指纹 | GPU 渲染器字符串 | CloakBrowser 真实渲染 |
| 滑动验证码 | 拼图缺口位置 | 暂时无法自动破解 |
| IP 封锁 | 请求 IP 段识别 | 代理 IP / 住宅代理 |
| Cloudflare Turnstile | JS 行为分析 | CloakBrowser humanize 模式 |

---

## 工具对比

| 工具 | 原理 | 适用场景 |
|------|------|---------|
| agent-browser | Playwright CDP 封装 | OpenClaw 内置，适合 AI 操控 |
| playwright-cli | 微软 AI Agent CLI | Claude Code 等编程 Agent |
| CloakBrowser | 源码修改 Chromium | **强反爬网站克星** |
| Scrapling | Python 自适应爬虫 | 普通网站，AI 友好 |
| undetected-chromedriver | Selenium + 补丁 | 老项目兼容 |

---

## 浏览器操作工具优先级

1. **优先用 playwright-cli** — 操作简洁、命令直观，适合 AI Agent 场景
2. ** playwright-cli 遇到问题时用 agent-browser** — OpenClaw 内置，适合精细控制
3. **被强反爬拦死时用 CloakBrowser** — 特别是微信公众平台
4. **普通网站被抓不到数据时** — 试试降低请求频率、加 header
5. **验证码问题** — 滑动类基本无解，点选类可尝试打码平台
6. **IP 问题** — 换代理，但成本高，优先尝试其他方法