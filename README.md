# skillgate-agent 🦀（已全开源）

基于 MiniMax-M2.7（也可以自定义模型）的 AI Agent 框架，包含 **xCrab (AI执行引擎)**、**eclaw (服务分发器)**、**cclaw (远程分发器)** 和 **wclaw (Web客户端)** 四大核心组件。

一套仓库，即可完整部署！【如果你实在嫌麻烦，你可以让 AI 编程工具（Claude Code，Codex，Windsurf，OpenCode，Trae）帮你部署即可】

---

## 📦 系统架构

```
skillgate-agent/
├── deploy.sh              # 一键部署脚本
├── README.md              # 中文文档（当前文件）
├── README_EN.md           # 英文文档
├── .env.example           # 根环境变量模板
├── LICENSE                # MIT 许可证
├── xCrab/                 # AI 执行引擎（核心）
│   ├── index.js           # 主入口
│   ├── src/               # 核心源码
│   ├── skills/            # 技能模块
│   └── wclaw/             # Web 客户端前端
├── eclaw/                 # 服务分发器（后端）
│   ├── server.js          # Express + WebSocket 服务
│   ├── cloud-sync.js      # 数据库同步
│   └── wclaw/             # Web 客户端副本
└── cclaw/                 # 远程分发器（客户端）
    ├── index.js           # 主入口
    └── data/              # 配置和会话数据
```

## 功能特性

- 🤖 **AI 对话** - 支持 MiniMax-M2.7、DeepSeek 等多模型切换
- 🦀 **技能系统** - 支持动态加载各种技能（浏览器自动化、翻译等）
- 💾 **记忆系统** - 支持对话历史存储和检索（SQLite）
- 🔐 **Gateway 认证** - 支持 Token 认证保护
- 🌐 **浏览器自动化** - 可选支持 Playwright 浏览器控制
- 📡 **多模块架构** - 集成 xCrab、eclaw、cclaw、wclaw 四大模块
- 📱 **短信验证** - 支持短信宝进行手机验证登录

---

## 🚀 快速部署

### 方式一：一键部署（推荐）

```bash
git clone https://github.com/yzp100911/skillgate-agent.git
cd skillgate-agent
chmod +x deploy.sh
./deploy.sh
```

### 方式二：手动部署

#### 1. 环境要求

- Node.js >= 18.0.0（xCrab/eclaw），>= 22.12（cclaw）
- MySQL 5.7+ 或 MariaDB 10.3+
- PM2（进程管理器）
- Nginx（反向代理，可选）

#### 2. 安装依赖

```bash
# 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
npm install -g pm2

# 安装 MySQL
sudo apt-get install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

#### 3. 配置数据库

```bash
# 配置 MySQL 认证（解决 caching_sha2_password 问题）
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password'; FLUSH PRIVILEGES;"

# 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS wclaw_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

#### 4. 部署 xCrab（AI 执行引擎）

```bash
cd skillgate-agent/xCrab

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要的 API Key

# 启动服务
pm2 start ecosystem.config.cjs
pm2 save

# 验证
curl http://localhost:60016/health
```

#### 5. 部署 eclaw（服务分发器）

```bash
cd skillgate-agent/eclaw

# 安装依赖
npm install

# 配置环境变量
# 编辑 .env 文件，配置数据库和 xCrab Token

# 启动服务
node server.js
# 或使用 PM2
pm2 start server.js --name eclaw
```

#### 6. 部署 cclaw（远程分发器）

```bash
cd skillgate-agent/cclaw

# 安装依赖
npm install

# 启动客户端
chmod +x start.sh
./start.sh
# 或直接运行
node index.js
```

---

## ⚙️ 配置说明

### xCrab 环境变量 (`xCrab/.env`)

```bash
# 必填 - API Keys
MINIMAX_API_KEY=your_minimax_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 可选 - MIMO API（小米模型）
MIMO_API_KEY=your_mimo_api_key_here
MIMO_BASE_URL=https://api.xiaomimimo.com/v1

# 模型选择
MODEL=MiniMax-M2.7  # 或 deepseek-v4-flash

# Gateway 配置
GATEWAY_ENABLED=true
GATEWAY_PORT=3000
GATEWAY_TOKEN=your_gateway_token_here

# 记忆系统
ENABLE_MEMORY=true
```

### eclaw 环境变量 (`eclaw/.env`)

```bash
# 数据库配置
DB_HOST=localhost
DB_USER=wclaw_db
DB_PASS=your_db_password_here
DB_NAME=wclaw_db

# xCrab Token（用于连接 xCrab 执行引擎）
XCRAB_TOKEN=your_xcrab_token_here

# 短信宝配置（可选）
SMSBAO_USER=your_smsbao_user_here
SMSBAO_PASSWORD=your_smsbao_password_here
```

### cclaw 环境变量

```bash
# 连接 eclaw 服务端地址（默认本地）
export ECLAW_API_URL=http://127.0.0.1:10090
export ECLAW_WS_URL=ws://127.0.0.1:10090/ws

# 连接远程服务器
export ECLAW_API_URL=http://your-server:10090
export ECLAW_WS_URL=ws://your-server:10090/ws
```

---

## 🔧 服务管理

### xCrab

```bash
pm2 status xcrab       # 查看状态
pm2 logs xcrab         # 查看日志
pm2 restart xcrab      # 重启
pm2 stop xcrab         # 停止
pm2 delete xcrab       # 删除进程
```

### eclaw

```bash
pm2 status eclaw       # 查看状态
pm2 logs eclaw         # 查看日志
pm2 restart eclaw      # 重启
```

### cclaw

```bash
pm2 status cclaw       # 查看状态
pm2 logs cclaw         # 查看日志
pm2 restart cclaw      # 重启
```

---

## 🌐 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| xCrab Gateway | http://localhost:60016 | AI 执行引擎 API |
| xCrab 健康检查 | http://localhost:60016/health | 服务状态 |
| eclaw 服务端 | http://localhost:10001 | 后端 API（Nginx 代理到 10090） |
| wclaw 网页端 | http://localhost:10001 | Web 客户端界面 |
| WebSocket | ws://localhost:10001/ws | 实时通信 |

---

## 📡 API 使用

### xCrab Chat API

```bash
curl -X POST http://localhost:60016/api/chat \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好，请介绍一下自己"}'
```

### eclaw 登录 API

```bash
curl -X POST http://localhost:10001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"your_username","password":"your_password","phone":"your_phone","sms_code":"123456"}'
```

---

## 🔍 健康检查

```bash
# xCrab 健康检查
curl http://localhost:60016/health
# 返回: {"status":"ok","timestamp":"...","uptime":...}

# eclaw 健康检查
curl http://localhost:10001/api/health
```

---

## 📊 进程监控

```bash
# 查看所有进程状态
pm2 status

# 查看所有日志
pm2 logs

# 监控面板
pm2 monit

# 设置开机自启
pm2 startup
pm2 save
```

---

## 🔐 Nginx 配置（可选）

如果需要通过域名访问，配置 Nginx 反向代理：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # eclaw 服务端
    location / {
        proxy_pass http://127.0.0.1:10001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # xCrab Gateway
    location /xcrab/ {
        proxy_pass http://127.0.0.1:60016/;
    }
}
```

---

## 📝 详细文档

各模块的详细部署和使用说明请参考对应目录下的 README：

| 模块 | 说明 | 文档 |
|------|------|------|
| xCrab | AI 执行引擎（核心） | [xCrab/README.md](xCrab/README.md) |
| xCrab (EN) | AI Execution Engine | [xCrab/README_EN.md](xCrab/README_EN.md) |

---

## 📝 部署经验与注意事项（实战总结）

### 1. xCrab 启动报错：Cannot find module sqlite-store.js

**问题**：仓库缺少 `xCrab/src/memory/sqlite-store.js` 文件，导致 xCrab 无法启动。

**解决**：手动创建该文件（完整代码见下方）。

### 2. MiniMax API 地址配置

**问题**：使用 `https://api.minimaxi.com/anthropic` 地址会返回 404 错误。

**解决**：MiniMax 使用 OpenAI 兼容格式，应配置为：

```bash
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

### 3. eclaw 端口与 cclaw 不匹配

**问题**：eclaw 默认监听 10001 端口，但 cclaw 默认连接 10090 端口。

**解决**：修改 `eclaw/server.js` 中的端口：

```javascript
// 找到这行并修改
const PORT = 10090;  // 原为 10001
```

### 4. PM2 启动 xCrab 时 dotenv 不加载

**问题**：使用 `pm2 start ecosystem.config.cjs` 时，.env 文件可能不被正确加载。

**解决**：使用 npm start 方式启动：

```bash
cd xCrab
pm2 start npm --name xcrab -- start
```

或直接启动：

```bash
cd xCrab
pm2 start index.js --name xcrab
```

### 5. MySQL 认证问题

**问题**：Ubuntu 24.04 的 MySQL 8.0 默认使用 caching_sha2_password 认证。

**解决**：使用 debian-sys-maint 账号或修改认证方式：

```bash
# 查看 debian 维护账号密码
cat /etc/mysql/debian.cnf

# 或修改 root 认证方式
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';"
```

### 6. 完整部署检查清单

```bash
# 1. 检查所有服务状态
pm2 status

# 2. 检查端口占用
ss -tlnp | grep -E ":(3000|10090)"

# 3. 测试 xCrab API
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"你好"}'

# 4. 测试 eclaw API
curl -X POST http://localhost:10090/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# 5. 查看日志
pm2 logs xcrab --lines 50
pm2 logs eclaw --lines 50
pm2 logs cclaw --lines 50
```



## ❓ 常见问题

### 1. MySQL 认证失败
```
Error: ER_NOT_SUPPORTED_AUTH_MODE: Client does not support authentication protocol
```
**解决**：
```bash
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password'; FLUSH PRIVILEGES;"
```

### 2. 端口被占用
```
Error: listen EADDRINUSE :::60016
```
**解决**：
```bash
lsof -i :60016   # 查找占用进程
pm2 restart xcrab
```

### 3. cclaw 连接失败
**检查**：
- 确认 eclaw 服务已启动
- 检查 `ECLAW_API_URL` 和 `ECLAW_WS_URL` 配置是否正确
- 检查防火墙是否开放端口

---

## 许可证

本项目采用 [MIT 许可证](LICENSE) 开源。

---

<p align="center">
  <strong>skillgate-agent</strong> — 让 AI 助手触手可及 🦀
</p>
