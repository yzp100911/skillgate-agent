# skillgate-agent 🦀 (Fully Open Source)

An AI-Agent framework based on MiniMax-M2.7 (with custom model support), containing four core components: **xCrab (AI Execution Engine)**, **eclaw (Service Dispatcher)**, **cclaw (Remote Distributor)**, and **wclaw (Web Client)**.

Deploy everything with a single repository! [If you find it too tedious, you can use AI coding tools (Claude Code, Codex, Windsurf, OpenCode, Trae) to help you deploy.]

---

## 📦 System Architecture

```
skillgate-agent/
├── deploy.sh              # One-click deployment script
├── README.md              # Chinese documentation
├── README_EN.md           # English documentation (this file)
├── .env.example           # Root environment variable template
├── LICENSE                # MIT License
├── xCrab/                 # AI Execution Engine (core)
│   ├── README.md          # xCrab detailed docs (Chinese)
│   ├── README_EN.md       # xCrab detailed docs (English)
│   ├── index.js           # Main entry
│   ├── src/               # Core source code
│   ├── skills/            # Skill modules
│   ├── eclaw/             # Service dispatcher
│   ├── cclaw/             # Remote distributor
│   └── wclaw/             # Web client
```

## Features

- 🤖 **AI Chat** - Powered by MiniMax-M2.7 model
- 🦀 **Skill System** - Dynamic loading of various skills (browser automation, translation, etc.)
- 💾 **Memory System** - Session history storage and retrieval
- 🔐 **Gateway Auth** - Token-based authentication protection
- 🌐 **Browser Automation** - Optional Playwright browser control
- 📡 **Multi-Module Architecture** - Integrates xCrab, eclaw, cclaw, wclaw

## Quick Deployment

### Method 1: One-Click Deploy (Recommended)

```bash
git clone https://github.com/yzp100911/skillgate-agent.git
cd skillgate-agent
chmod +x deploy.sh
./deploy.sh
```

### Method 2: Manual Deploy

```bash
# 1. Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2
npm install -g pm2

# 3. Clone project
git clone https://github.com/yzp100911/skillgate-agent.git
cd skillgate-agent/xCrab

# 4. Install dependencies
npm install

# 5. Configure environment variables
cp .env.example .env
# Edit .env, fill in MINIMAX_API_KEY and AUTH_TOKEN

# 6. Start the service
chmod +x start.sh
./start.sh

# 7. Verify
curl http://localhost:60016/health
```

## Requirements

- Node.js >= 18.0.0
- PM2 (process manager)
- Git

## Detailed Documentation

Refer to the README in each module's directory for detailed deployment and usage instructions:

| Module | Description | Docs |
|--------|-------------|------|
| xCrab | AI Execution Engine (Core) | [xCrab/README.md](xCrab/README.md) |
| xCrab (EN) | AI Execution Engine | [xCrab/README_EN.md](xCrab/README_EN.md) |

## Configuration

Edit `xCrab/.env`:

```bash
# Required
AUTH_TOKEN=your_secure_token_here
MINIMAX_API_KEY=your_api_key_here

# Optional (with defaults)
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
MINIMAX_MODEL=MiniMax-M2.7
PORT=60016
ENABLE_MEMORY=true
GATEWAY_ENABLED=true
GATEWAY_TOKEN=your_gateway_token_here
```

## Service Management

```bash
pm2 status xcrab       # Check status
pm2 logs xcrab         # View logs
pm2 restart xcrab      # Restart
pm2 stop xcrab         # Stop
pm2 delete xcrab       # Delete process
```

## API Usage

```bash
curl -X POST http://localhost:60016/api/chat \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello, please introduce yourself"}'
```

## Health Check

```bash
curl http://localhost:60016/health
# {"status":"ok","timestamp":"...","uptime":...}
```

## License

This project is open-sourced under the [MIT License](LICENSE).

---

<p align="center">
  <strong>skillgate-agent</strong> — AI at your fingertips 🦀
</p>
