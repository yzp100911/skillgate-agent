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

## 📝 Deployment Tips & Troubleshooting (Real-World Experience)

### 1. xCrab startup error: Cannot find module sqlite-store.js

**Problem**: The repository is missing `xCrab/src/memory/sqlite-store.js`, causing xCrab to fail on startup.

**Solution**: Create this file manually (see full code in the repository).

### 2. MiniMax API Address Configuration

**Problem**: Using `https://api.minimaxi.com/anthropic` returns a 404 error.

**Solution**: MiniMax uses OpenAI-compatible format. Configure as:

```bash
MINIMAX_BASE_URL=https://api.minimaxi.com/v1
```

### 3. eclaw Port Mismatch with cclaw

**Problem**: eclaw defaults to port 10001, but cclaw connects to port 10090.

**Solution**: Modify the port in `eclaw/server.js`:

```javascript
// Find and change this line
const PORT = 10090;  // Originally 10001
```

### 4. PM2 Not Loading dotenv for xCrab

**Problem**: Using `pm2 start ecosystem.config.cjs` may not load the .env file correctly.

**Solution**: Start using npm start:

```bash
cd xCrab
pm2 start npm --name xcrab -- start
```

Or start directly:

```bash
cd xCrab
pm2 start index.js --name xcrab
```

### 5. MySQL Authentication Issues

**Problem**: Ubuntu 24.04's MySQL 8.0 uses caching_sha2_password by default.

**Solution**: Use the debian-sys-maint account or change authentication:

```bash
# View debian maintenance account password
cat /etc/mysql/debian.cnf

# Or change root authentication
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';"
```

### 6. Deployment Verification Checklist

```bash
# 1. Check all service status
pm2 status

# 2. Check port usage
ss -tlnp | grep -E ":(3000|10090)"

# 3. Test xCrab API
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello"}'

# 4. Test eclaw API
curl -X POST http://localhost:10090/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# 5. View logs
pm2 logs xcrab --lines 50
pm2 logs eclaw --lines 50
pm2 logs cclaw --lines 50
```



## License

This project is open-sourced under the [MIT License](LICENSE).

---

<p align="center">
  <strong>skillgate-agent</strong> — AI at your fingertips 🦀
</p>
