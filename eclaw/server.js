// 环境变量注入（云服务器部署用）
process.env.DB_USER = process.env.DB_USER || 'wclaw_db';
process.env.DB_PASS = process.env.DB_PASS || '100911yzpYZP';
process.env.DB_NAME = process.env.DB_NAME || 'wclaw_db';
process.env.XCRAB_TOKEN = process.env.XCRAB_TOKEN || '100911yzpYZP@';
process.env.YOLO_API_URL = process.env.YOLO_API_URL || 'http://localhost:60016';
process.env.SMSBAO_USER = process.env.SMSBAO_USER || 'yzp100911';
process.env.SMSBAO_PASSWORD = process.env.SMSBAO_PASSWORD || '100911yzpYZP';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const querystring = require('querystring');
const mysql = require('mysql2/promise');
const multer = require('multer');
const { startTunnel, stopTunnel, getCloudDbConfig, syncFavorite, unsyncFavorite } = require('./cloud-sync');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(cors());
app.use(express.json());
// 托管 wclaw 前端页面
app.use(express.static(path.join(__dirname, 'wclaw')));
// 托管上传的文件
//app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // 禁用静态文件服务，改为强制下载

// 辅助函数：RFC 5987 编码文件名（支持非 ASCII 字符）
function encodeFilenameRFC598(filename) {
    // 使用 encodeURIComponent 进行百分号编码，兼容非 ASCII 字符
    // 保留 %20 而非替换为空格（RFC 5987 要求百分号编码）
    return encodeURIComponent(filename);
}

// 强制下载路由（替换静态文件服务）
app.get('/uploads/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(__dirname, 'uploads', filename);
    if (fs.existsSync(filePath)) {
        // 提取原始文件名（不含路径）
        const originalName = path.basename(filename);
        // RFC 5987 编码，防止非 ASCII 字符导致 Invalid character in header 错误
        const encodedName = encodeFilenameRFC598(originalName);
        res.setHeader('Content-Disposition', 'attachment; filename*=UTF-8\'\'' + encodedName);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.sendFile(filePath);
    } else {
        res.status(404).json({ code: 404, message: '文件不存在' });
    }
});

const JWT_SECRET = 'your-super-secret-key-for-eclaw';

// xCrab Gateway 配置
const XCRAB_API_URL = process.env.XCRAB_API_URL || 'http://localhost:3000';
const XCRAB_TOKEN = process.env.XCRAB_TOKEN || '';

// 配置 MySQL 连接池（通过 SSH 隧道连接到云服务器）
const pool = mysql.createPool(getCloudDbConfig());

// 初始化数据库和表（通过 SSH 隧道）
async function initDB() {
    try {
        // 先通过隧道连接云 MySQL，创建数据库
        const tunnelPool = mysql.createPool(getCloudDbConfig());
        await tunnelPool.query("CREATE DATABASE IF NOT EXISTS wclaw_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        await tunnelPool.end();

        // 创建 users 表，注意去除了 phone 的 UNIQUE 约束
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建 history 表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                msg_id VARCHAR(50) NOT NULL,
                username VARCHAR(50) NOT NULL,
                role VARCHAR(10) NOT NULL,
                content TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'success',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 创建 tts_configs 表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tts_configs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                config TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 创建 feedbacks 表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS feedbacks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // 创建 favorites 表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS favorites (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                msg_id VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_fav (username, msg_id)
            )
        `);

        // 创建 notifications 表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                content TEXT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.execute(`
            CREATE TABLE IF NOT EXISTS authorized_phones (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(20) NOT NULL UNIQUE,
                authorized_by VARCHAR(50) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log("MySQL 数据库和表初始化成功！");
    } catch (err) {
        console.error("MySQL 初始化失败，请检查账号密码是否正确，或者 mysql 服务是否启动:", err);
    }
}

// 辅助函数：保存聊天记录
async function saveChatHistory(username, role, content, status = 'success') {
    // 根据用户隐私要求，不再将聊天记录保存在后台数据库
    return;
}

// 启动并初始化云数据库
startTunnel().then(() => {
    return initDB();
}).then(() => {
    console.log('[启动] 数据库初始化完成');
}).catch(err => {
    console.error('[启动] 数据库连接失败:', err.message);
});

// 进程退出时关闭 SSH 隧道
process.on('SIGINT', () => { stopTunnel(); process.exit(0); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(0); });

// 存储在线的 cclaw 连接 (username -> WebSocket)
const clients = new Map();

// 存储等待结果的手机端请求 (username -> Array of Response objects)
const pendingWebClients = new Map();

// 持久化通知 SSE 连接 (username -> Array of Response objects)，页面打开期间一直保持
const notificationClients = new Map();

// 消息缓冲队列：当网页端SSE连接慢于cclaw消息到达时，先缓存消息
const messageBuffer = new Map();
// 缓冲消息的TTL：5分钟内未连接的缓冲将被丢弃（长任务可能需要更久）
const BUFFER_TTL = 300000;

// 会话执行时间戳跟踪：用于检测会话是否"卡死"（长时间无活动）
// key: `${username}_${sessionId}`, value: { lastActivity, startedAt }
const sessionActivityTimestamps = new Map();

// 存储短信验证码 (phone -> { code, expire })
const verificationCodes = new Map();

// 存储 cclaw 执行状态 (username -> { executing, sessionCount, lastChanged, lastSeen, timestamp })
const cclawExecStatus = new Map();

// 当前大模型
let currentModel = 'deepseek'; // 默认 deepseek-v4-flash
// 启动时尝试检测当前模型
const MODEL_CHECK_PATHS = [
    // OC(废弃)：以下 OpenClaw 配置文件路径已废弃，保留供参考
    // 'D:\\Cclaw\\cclaw\\data\\openclaw.json',
    // 'D:\\Cclaw\\UbuntuClaw\\cclaw\\data\\openclaw.json',
    // '/opt/cclaw-client/UbuntuClaw/data/openclaw.json',
    // '/opt/cclaw-client/UbuntuClaw/cclaw/data/openclaw.json'
];
for (const configPath of MODEL_CHECK_PATHS) {
    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const primary = config?.agents?.defaults?.model?.primary || '';
            if (primary.includes('MiniMax-M2.7')) {
                currentModel = 'minimax';
            } else if (primary.includes('deepseek-v4-flash')) {
                currentModel = 'deepseek';
            }
            console.log(`[模型检测] 当前模型: ${currentModel} (${primary})`);
            break;
        }
    } catch (e) {
        console.error(`[模型检测] 读取 ${configPath} 失败:`, e.message);
    }
}

// ================================================================
//  云端执行端标识配置
//  该账号名用于标识私有的云端执行端（默认 'ad1009'）。
//  注：服务端按用户名路由指令，各用户的网页端只能操作自己账号的 cclaw，
//  因此天然隔离。此配置仅用于登录时返回 canUseCloud 信息字段，
//  不影响其他用户使用自己的本地 cclaw。
//  账号名通过环境变量 ALLOWED_CLOUD_ACCOUNT 配置，
//  避免在前端代码中硬编码暴露账号名。
const ALLOWED_CLOUD_ACCOUNT = process.env.ALLOWED_CLOUD_ACCOUNT || 'ad1009';

function isCloudAllowed(username) {
    return username === ALLOWED_CLOUD_ACCOUNT;
}

// HTTP 接口：发送短信验证码 (短信宝)
app.post('/api/send_sms', (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ code: 400, message: '手机号不能为空' });

    // 生成 6 位随机验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    // 有效期 5 分钟
    verificationCodes.set(phone, { code, expire: Date.now() + 5 * 60 * 1000 });

    console.log(`\n[开发测试] 手机号 ${phone} 的验证码是: ${code} (5分钟内有效)\n`);

    const smsapi = "api.smsbao.com";
    const user = process.env.SMSBAO_USER || "YOUR_SMSBAO_USER";
    const password = process.env.SMSBAO_PASSWORD || "YOUR_SMSBAO_PASS";

    // 检查是否还在使用默认的占位符（避免用户没改全）
    if (user === "YOUR_SMSBAO_USER") {
        console.log("提示: 未配置真实的 SMSBAO_USER，已跳过发送，请在上方查看验证码进行测试。");
        return res.json({ code: 200, message: '验证码已发送 (开发模式)' });
    }

    const content = `【魔童屋】您的验证码是${code}，5分钟内有效，请勿泄露。`;
    const pass = crypto.createHash('md5').update(password).digest('hex');
    
    // 使用 URLSearchParams 确保中文内容被正确 urlencode
    const queryParams = new URLSearchParams({
        u: user,
        p: pass,
        m: phone,
        c: content
    });
    
    const requestPath = '/sms?' + queryParams.toString();
    console.log(`[短信请求] 正在请求短信宝: http://${smsapi}${requestPath}`);

    const options = {
        hostname: smsapi,
        path: requestPath,
        method: 'GET'
    };

    const request = http.request(options, function(response) {
        let responseData = '';
        response.setEncoding('utf-8');
        response.on('data', function(chunk) {
            responseData += chunk;
        });
        response.on('end', function() {
            const result = responseData.trim();
            console.log(`[短信结果] 短信宝返回状态码: ${result}`);
            
            if (result === '0') {
                res.json({ code: 200, message: '验证码发送成功' });
            } else {
                let errorMsg = '未知错误';
                switch(result) {
                    case '-1': errorMsg = '参数不全'; break;
                    case '-2': errorMsg = '服务器空间不支持'; break;
                    case '30': errorMsg = '密码错误'; break;
                    case '40': errorMsg = '账户不存在'; break;
                    case '41': errorMsg = '余额不足'; break;
                    case '42': errorMsg = '账户已过期'; break;
                    case '43': errorMsg = 'IP地址限制'; break;
                    case '50': errorMsg = '内容含有敏感字'; break;
                    case '51': errorMsg = '手机号码不正确'; break;
                }
                res.status(500).json({ code: 500, message: `短信发送失败: ${errorMsg} (${result})` });
            }
        });
    });
    
    request.on('error', function(err) {
        console.error("[短信错误] 请求短信接口失败:", err);
        res.status(500).json({ code: 500, message: '请求短信接口网络失败' });
    });
    request.end();
});

// HTTP 接口：检测账号是否存在
app.post('/api/check_username', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ code: 400, message: '账号不能为空' });

    const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,7}$/;
    if (!usernameRegex.test(username)) {
        return res.json({ code: 200, exist: true, message: '用户名称最多只能是7个字符（支持中文、英文、数字）' });
    }

    try {
        const [existingUsers] = await pool.execute("SELECT id FROM users WHERE username = ?", [username]);
        if (existingUsers.length > 0) {
            res.json({ code: 200, exist: true, message: '该账号已注册，请登录' });
        } else {
            res.json({ code: 200, exist: false, message: '账号可用' });
        }
    } catch (err) {
        console.error("检测账号失败:", err);
        res.status(500).json({ code: 500, message: '服务器内部错误' });
    }
});

// HTTP 接口：重置密码 (wclaw 端)
app.post('/api/reset_password', async (req, res) => {
    const { username, phone, sms_code, new_password } = req.body;
    
    if (!username || !phone || !sms_code || !new_password) {
        return res.status(400).json({ code: 400, message: '请填写完整找回信息' });
    }

    const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,7}$/;
    if (!usernameRegex.test(username)) {
        return res.status(400).json({ code: 400, message: '用户名称最多只能是7个字符（支持中文、英文、数字）' });
    }

    // 校验短信验证码
    const record = verificationCodes.get(phone);
    if (!record || record.code !== sms_code || Date.now() > record.expire) {
        return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
    }

    try {
        // 检查账号和手机号是否匹配
        const [users] = await pool.execute("SELECT * FROM users WHERE username = ? AND phone = ?", [username, phone]);
        if (users.length === 0) {
            return res.status(400).json({ code: 400, message: '账号与手机号不匹配，或账号不存在' });
        }

        // 更新密码
        await pool.execute("UPDATE users SET password = ? WHERE username = ? AND phone = ?", [new_password, username, phone]);
        
        // 成功，消耗验证码
        verificationCodes.delete(phone);
        res.json({ code: 200, message: '密码重置成功，请使用新密码登录' });
    } catch (err) {
        console.error("重置密码失败:", err);
        res.status(500).json({ code: 500, message: '服务器内部错误' });
    }
});

// HTTP 接口：注册 (wclaw 端)
app.post('/api/register', async (req, res) => {
    const { username, password, phone, sms_code } = req.body;
    
    if (!username || !password || !phone || !sms_code) {
        return res.status(400).json({ code: 400, message: '请填写完整注册信息' });
    }

    const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,7}$/;
    if (!usernameRegex.test(username)) {
        return res.status(400).json({ code: 400, message: '用户名称最多只能是7个字符（支持中文、英文、数字）' });
    }

    // 校验短信验证码
    const record = verificationCodes.get(phone);
    if (!record || record.code !== sms_code || Date.now() > record.expire) {
        return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
    }

    try {
        // 检查账号是否已存在，以及手机号注册次数
        const [existingUsers] = await pool.execute("SELECT * FROM users WHERE username = ? OR phone = ?", [username, phone]);
        
        let phoneCount = 0;
        let isUsernameExist = false;

        for (const u of existingUsers) {
            if (u.username === username) isUsernameExist = true;
            if (u.phone === phone) phoneCount++;
        }

        if (isUsernameExist) {
            return res.status(400).json({ code: 400, message: '该账号已注册，请登录' });
        }

        if (phoneCount >= 10) {
            return res.status(400).json({ code: 400, message: '该手机号注册的账号数量已达上限（10个）' });
        }

        // 插入新用户
        await pool.execute("INSERT INTO users (username, password, phone) VALUES (?, ?, ?)", [username, password, phone]);
        
        // 注册成功，消耗验证码
        verificationCodes.delete(phone);
        res.json({ code: 200, message: '注册成功' });
    } catch (err) {
        console.error("注册入库失败:", err);
        res.status(500).json({ code: 500, message: '服务器内部错误' });
    }
});

// HTTP 接口：供 wclaw (手机端) 和 cclaw (电脑端) 登录 (升级为支持双重验证 + 验证码登录)
app.post('/api/login', async (req, res) => {
    const { username, password, phone, sms_code, device_token, login_mode } = req.body;

    // 验证码登录模式：仅通过手机号+验证码登录
    if (login_mode === 'sms') {
        if (!phone || !sms_code) {
            return res.status(400).json({ code: 400, message: '请填写手机号和验证码' });
        }

        // 校验短信验证码
        const record = verificationCodes.get(phone);
        if (!record || record.code !== sms_code || Date.now() > record.expire) {
            return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
        }

        try {
            // 通过手机号查找用户
            const [users] = await pool.execute(
                "SELECT * FROM users WHERE phone = ?",
                [phone]
            );

            if (users.length === 0) {
                return res.status(401).json({ code: 401, message: '该手机号未注册' });
            }

            let user;
            if (users.length === 1) {
                // 只有一个账号，直接登录
                user = users[0];
            } else {
                // 多个账号，需要用户指定
                if (!username) {
                    const accountList = users.map(u => u.username);
                    return res.status(409).json({
                        code: 409,
                        message: '该手机号绑定了多个账号，请选择',
                        data: { accounts: accountList, need_select: true }
                    });
                }
                // 用户指定了账号，查找匹配的
                user = users.find(u => u.username === username);
                if (!user) {
                    return res.status(401).json({ code: 401, message: '账号与手机号不匹配' });
                }
            }

            const tokenUsername = user.username;

            // 签发 token
            const token = jwt.sign({ username: tokenUsername }, JWT_SECRET, { expiresIn: '7d' });
            const newDeviceToken = jwt.sign({ type: 'device', username: tokenUsername }, JWT_SECRET, { expiresIn: '365d' });

            // 登录成功，消耗验证码
            verificationCodes.delete(phone);

            res.json({
                code: 200,
                message: '登录成功',
                data: {
                    token,
                    username: tokenUsername,
                    device_token: newDeviceToken,
                    canUseCloud: isCloudAllowed(tokenUsername),
                    phone: user.phone
                }
            });
        } catch (err) {
            console.error("验证码登录查询失败:", err);
            res.status(500).json({ code: 500, message: '服务器内部错误' });
        }
        return;
    }

    // 密码登录模式（原有逻辑）
    if (!username || !password) {
        return res.status(400).json({ code: 400, message: '请填写账号和密码' });
    }

    const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,7}$/;
    if (!usernameRegex.test(username)) {
        return res.status(400).json({ code: 400, message: '用户名称最多只能是7个字符（支持中文、英文、数字）' });
    }

    let isTrusted = false;
    
    // 特殊处理：yzp1009 和 ad1009 账号免双重验证
    if (username === 'yzp1009' || username === 'ad1009') {
        isTrusted = true;
    } else if (device_token) {
        try {
            const decoded = jwt.verify(device_token, JWT_SECRET);
            if (decoded.type === 'device' && decoded.username === username) {
                isTrusted = true;
            }
        } catch(e) {}
    }

    try {
        let userPhone = null;
        if (!isTrusted) {
            if (!phone || !sms_code) {
                return res.status(400).json({ code: 400, message: '新设备登录，请填写手机号和验证码' });
            }
            // 校验短信验证码
            const record = verificationCodes.get(phone);
            if (!record || record.code !== sms_code || Date.now() > record.expire) {
                return res.status(400).json({ code: 400, message: '验证码错误或已过期' });
            }

            // 校验绑定的手机号是否匹配
            const [users] = await pool.execute(
                "SELECT * FROM users WHERE username = ? AND password = ? AND phone = ?",
                [username, password, phone]
            );

            if (users.length === 0) {
                return res.status(401).json({ code: 401, message: '账号、密码或手机号不匹配' });
            }

            userPhone = users[0].phone;
            // 登录成功，消耗验证码
            verificationCodes.delete(phone);
        } else {
            // 信任设备，只校验账号密码
            const [users] = await pool.execute(
                "SELECT * FROM users WHERE username = ? AND password = ?",
                [username, password]
            );

            if (users.length === 0) {
                return res.status(401).json({ code: 401, message: '账号或密码错误' });
            }

            userPhone = users[0].phone;
        }

        // 签发 token
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
        const newDeviceToken = jwt.sign({ type: 'device', username }, JWT_SECRET, { expiresIn: '365d' });

        res.json({ code: 200, message: '登录成功', data: { token, username, device_token: newDeviceToken, canUseCloud: isCloudAllowed(username), phone: userPhone } });
    } catch (err) {
        console.error("登录查询失败:", err);
        res.status(500).json({ code: 500, message: '服务器内部错误' });
    }
});

// TTS 配置：获取
app.get('/api/tts_config', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const [rows] = await pool.execute("SELECT config FROM tts_configs WHERE username = ?", [decoded.username]);
        const config = rows.length > 0 ? JSON.parse(rows[0].config) : {};
        res.json({ code: 200, data: config });
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// TTS 配置：保存
app.post('/api/tts_config', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        const config = req.body.config || {};
        await pool.execute(
            "INSERT INTO tts_configs (username, config) VALUES (?, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)",
            [decoded.username, JSON.stringify(config)]
        );
        res.json({ code: 200, message: '保存成功' });
    } catch (err) {
        console.error('TTS 配置保存失败:', err);
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// 本地 localhost-only token 签发（供同机 cclaw 自动恢复连接使用，无需密码）
app.post('/api/local_token', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
        return res.status(403).json({ code: 403, message: '仅限本地调用' });
    }
    const { username } = req.body;
    if (!username) return res.status(400).json({ code: 400, message: '用户名不能为空' });
    // 仅限信任账号免验证码签发 token
    if (username !== 'yzp1009' && username !== 'ad1009') {
        return res.status(403).json({ code: 403, message: '该账号不允许免密签发 Token' });
    }
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    console.log(`[本地Token] 为 ${username} 签发了新 token`);
    res.json({ code: 200, token });
});

// HTTP 接口：wclaw 发送指令给 eclaw
app.post('/api/command', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ code: 401, message: '未提供 Token' });
    }
    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const { command, sessionId, backend } = req.body;
        console.log(`[DEBUG /api/command] backend from frontend: "${backend}", currentBackend value would be: ${backend || 'xcrab'}`);

        if (!command) {
            return res.status(400).json({ code: 400, message: '指令不能为空' });
        }

        // 查找该用户的 cclaw 连接
        const clientWs = clients.get(username);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            // 保存用户的指令
            saveChatHistory(username, 'user', command);
            
            // 发送指令给 cclaw，带上 sessionId 和 username
            clientWs.send(JSON.stringify({ type: 'command', data: command, sessionId: sessionId, backend: backend || 'xcrab', username: username }));
            res.json({ code: 200, message: '指令已下发给 cclaw' });
        } else {
            res.status(404).json({ code: 404, message: '电脑端 cclaw 未在线，无法发送指令' });
        }
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
    }
});

// HTTP 接口：前端通知服务器有新会话，转发给 cclaw
app.post('/api/new_session', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const { sessionId, title } = req.body;

        if (!sessionId) {
            return res.status(400).json({ code: 400, message: 'sessionId 不能为空' });
        }

        // 转发给 cclaw
        const clientWs = clients.get(username);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
                type: 'new_session',
                sessionId,
                title: title || '新对话'
            }));
            console.log(`[新会话] 已通知 cclaw: ${username}, sessionId: ${sessionId}, title: ${title || '新对话'}`);
            res.json({ code: 200, message: '已通知 cclaw 创建新会话' });
        } else {
            console.log(`[新会话] cclaw 未在线，仅创建前端会话: ${username}, sessionId: ${sessionId}`);
            res.json({ code: 200, message: 'cclaw 不在线，会话仅在前端创建' });
        }
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// HTTP 接口：获取历史聊天记录
app.get('/api/history', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        
        // 从 MySQL 获取最近 100 条历史记录，并关联 favorites 表判断是否已收藏
        const [rows] = await pool.execute(
            `SELECT h.msg_id as id, h.role, h.content, h.status, h.timestamp, 
             IF(f.id IS NOT NULL, 1, 0) as is_favorited
             FROM history h 
             LEFT JOIN favorites f ON h.msg_id = f.msg_id AND h.username = f.username
             WHERE h.username = ? ORDER BY h.id ASC LIMIT 100`,
            [username]
        );
        
        res.json({ code: 200, data: rows });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
        } else {
            console.error("查询历史记录失败:", err);
            res.status(500).json({ code: 500, message: '服务器内部错误' });
        }
    }
});

// HTTP 接口：手机端 SSE 实时获取结果
app.get('/api/stream_result', (req, res) => {
    const token = req.query.token;
    const sessionId = req.query.sessionId || 'default';
    if (!token) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const key = `${username}_${sessionId}`;
        console.log(`[SSE 连接] 创建 SSE 连接: username: ${username}, sessionId: ${sessionId}, key: ${key}, pendingWebClients.size: ${pendingWebClients.size}`);
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // 启用心跳保活，防止代理/负载均衡器断开空闲 SSE 连接
        startSSEHeartbeat(key, res);

        if (!pendingWebClients.has(key)) {
            pendingWebClients.set(key, []);
            console.log(`[SSE 连接] 创建新 key: ${key}`);
        }
        pendingWebClients.get(key).push(res);
        console.log(`[SSE 连接] 已添加，pendingWebClients.get('${key}').length = ${pendingWebClients.get(key).length}`);
        console.log(`[SSE 连接] 所有 keys: ${Array.from(pendingWebClients.keys()).join(', ')}`);

        // 有新客户端接入，取消空闲清理计时器
        cancelSSEIdleTimer(key);

        // 检查是否有缓冲消息，如果有则立即发送
        if (messageBuffer.has(key)) {
            const bufferedMessages = messageBuffer.get(key);
            console.log(`[SSE 连接] 发现 ${bufferedMessages.length} 条缓冲消息，立即发送`);
            bufferedMessages.forEach(msgData => {
                try {
                    res.write(`data: ${JSON.stringify(msgData)}\n\n`);
                } catch(e) {
                    console.log(`[SSE 连接] 发送缓冲消息失败: ${e.message}`);
                }
            });
            // 清空缓冲
            messageBuffer.delete(key);
        }
        
        req.on('close', () => {
            removePendingClient(key, res);
            console.log(`[SSE 连接] 断开连接，remaining: ${pendingWebClients.has(key) ? pendingWebClients.get(key).length : 0}`);
        });
        
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// HTTP 接口：手机端轮询获取结果 (保留为了兼容，但新版可改用 SSE)
app.get('/api/poll_result', (req, res) => {
    const authHeader = req.headers.authorization;
    const sessionId = req.query.sessionId || 'default';
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const key = `${username}_${sessionId}`;
        
        req.setTimeout(30000, () => {
            removePendingClient(key, res);
            res.json({ code: 204, message: 'timeout' });
        });

        if (!pendingWebClients.has(key)) {
            pendingWebClients.set(key, []);
        }
        pendingWebClients.get(key).push(res);
        
        req.on('close', () => {
            removePendingClient(key, res);
        });
        
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

function removePendingClient(key, res) {
    if (pendingWebClients.has(key)) {
        const arr = pendingWebClients.get(key);
        const index = arr.indexOf(res);
        if (index > -1) arr.splice(index, 1);
        if (arr.length === 0) {
            // 不立即删除 key，启动 30 分钟空闲计时器
            // 期间如果有新客户端连接（如 EventSource 重连），计时器会被取消
            startSSEIdleTimer(key);
        }
    }
}

// 更新会话活动时间戳，用于检测卡死/进程退出
function updateSessionActivity(key, startedAt) {
    const now = Date.now();
    if (!sessionActivityTimestamps.has(key)) {
        sessionActivityTimestamps.set(key, { lastActivity: now, startedAt: startedAt || now });
    } else {
        const record = sessionActivityTimestamps.get(key);
        record.lastActivity = now;
        if (startedAt) record.startedAt = startedAt;
    }
}

function startSSEIdleTimer(key) {
    if (sseIdleTimers.has(key)) {
        clearTimeout(sseIdleTimers.get(key));
    }
    console.log(`[SSE 空闲] 启动 30 分钟空闲计时器: ${key}`);
    const timer = setTimeout(() => {
        console.log(`[SSE 空闲] 30 分钟超时，清理空闲 SSE: ${key}`);
        pendingWebClients.delete(key);
        sseIdleTimers.delete(key);
        // 同时清理该 key 的心跳
        const hb = sseHeartbeats.get(key);
        if (hb) {
            clearInterval(hb);
            sseHeartbeats.delete(key);
        }
    }, SSE_IDLE_TIMEOUT);
    sseIdleTimers.set(key, timer);
}

function cancelSSEIdleTimer(key) {
    if (sseIdleTimers.has(key)) {
        clearTimeout(sseIdleTimers.get(key));
        sseIdleTimers.delete(key);
        console.log(`[SSE 空闲] 取消空闲计时器: ${key}`);
    }
}

// SSE 心跳保活：定期向 SSE 连接发送注释行防止代理超时
const SSE_HEARTBEAT_INTERVAL = 15000;
const sseHeartbeats = new Map();

// SSE 空闲清理：所有客户端断开后等待 30 分钟再清理（防止频繁重连）
const SSE_IDLE_TIMEOUT = 30 * 60 * 1000;
const sseIdleTimers = new Map();
function startSSEHeartbeat(key, res) {
    const timer = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch(e) {
            clearInterval(timer);
            sseHeartbeats.delete(key);
        }
    }, SSE_HEARTBEAT_INTERVAL);
    sseHeartbeats.set(key, timer);
    // 监听 close 自动清理心跳
    res.on('close', () => {
        const t = sseHeartbeats.get(key);
        if (t) {
            clearInterval(t);
            sseHeartbeats.delete(key);
        }
    });
}

// 通知 SSE 端点：持久化连接，用于向网页端推送系统通知
app.get('/api/notification_sse', (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(401).json({ code: 401, message: '未提供 Token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        // 发送连接成功事件
        res.write(`event: connected\ndata: {"status":"connected","username":"${username}"}\n\n`);

        // 注册到 notificationClients，供 cron_deliver 使用
        if (!notificationClients.has(username)) {
            notificationClients.set(username, []);
        }
        notificationClients.get(username).push(res);
        console.log(`[通知SSE] ${username} 已连接，当前连接数: ${notificationClients.get(username).length}`);

        // 心跳保活
        const heartbeatTimer = setInterval(() => {
            try {
                res.write(': heartbeat\n\n');
            } catch(e) {
                clearInterval(heartbeatTimer);
            }
        }, 30000);

        req.on('close', () => {
            clearInterval(heartbeatTimer);
            const arr = notificationClients.get(username);
            if (arr) {
                const idx = arr.indexOf(res);
                if (idx > -1) arr.splice(idx, 1);
                if (arr.length === 0) notificationClients.delete(username);
                console.log(`[通知SSE] ${username} 断开连接，剩余: ${arr.length}`);
            }
        });
    } catch(e) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// Helper: 提取常见文件类型的文本内容
function extractFileContent(filePath, originalname) {
    const ext = path.extname(originalname).toLowerCase();
    const textExts = ['.txt', '.md', '.json', '.xml', '.html', '.htm', '.css', '.js', '.ts', '.py', '.sh', '.bash', '.sql', '.log', '.csv', '.yaml', '.yml', '.ini', '.cfg', '.conf'];
    const docExts = ['.doc', '.docx', '.odt'];
    const sheetExts = ['.xls', '.xlsx', '.ods', '.csv'];
    try {
        if (textExts.includes(ext)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        if (docExts.includes(ext) || sheetExts.includes(ext)) {
            const outputDir = path.join(__dirname, 'uploads');
            const result = execSync(
                `timeout 30 soffice --headless --convert-to txt:Text --outdir "${outputDir}" "${filePath}" 2>/dev/null`,
                { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
            ).trim();
            const txtPath = filePath.replace(/\.[^.]+$/, '.txt');
            if (fs.existsSync(txtPath)) {
                const content = fs.readFileSync(txtPath, 'utf8');
                try { fs.unlinkSync(txtPath); } catch(e) {}
                return content;
            }
        }
        return null;
    } catch (err) {
        console.log(`[文件提取] 提取文件内容失败 ${originalname}: ${err.message}`);
        return null;
    }
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'uploads'))
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(Buffer.from(file.originalname, 'latin1').toString('utf8'));
        // 使用纯 ASCII 文件名，避免中文编码导致文件系统/URL 不匹配
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 默认最大 50MB
    },
    fileFilter: function (req, file, cb) {
        // 如果是图片，限制为 10MB
        if (file.mimetype.startsWith('image/')) {
            const contentLength = parseInt(req.headers['content-length']);
            if (contentLength > 10 * 1024 * 1024) {
                return cb(new Error('IMAGE_TOO_LARGE'));
            }
        }
        cb(null, true);
    }
});

// HTTP 接口：文件和图片上传（包含附带的文字指令）
app.post('/api/upload_with_command', upload.single('file'), (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        if (!req.file) {
            return res.status(400).json({ code: 400, message: '请选择文件' });
        }

        const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        // 将文件名进行 URL 编码，避免下发给大模型的链接中含有未编码的中文，导致下载时报 404
        const encodedFilename = encodeURIComponent(req.file.filename);
        const fileUrl = '/uploads/' + encodedFilename;
        const isImage = req.file.mimetype.startsWith('image/');
        const textCommand = req.body.command || ''; // 获取随文件一起发送的文字
        const sessionId = req.body.sessionId || null; // 获取前端传递的 sessionId
        const backend = req.body.backend || 'xcrab'; // 获取后端选择
        
        // 构造消息内容，前端通过判断类型展示
        const fileMsg = JSON.stringify({
            type: isImage ? 'image' : 'file',
            url: fileUrl,
            name: originalname,
            size: req.file.size,
            text: textCommand
        });
        
        // 查找该用户的 cclaw 连接
        const clientWs = clients.get(username);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            saveChatHistory(username, 'user', fileMsg);
            
            // 构建完整的 HTTP URL，使得远端/本地 cclaw 可以通过网络下载该文件
            const protocol = req.headers['x-forwarded-proto'] || req.headers['x-scheme'] || req.protocol;
            const host = req.headers['x-forwarded-host'] || req.get('host');
            const fullUrl = `${protocol}://${host}${fileUrl}`;
            
            // ================================================================
            // xCrab 模式：提取文件内容嵌入 prompt，避免 AI 自己去 fetch 导致卡死
            // ================================================================
            if (backend === 'xcrab') {
                const filePath = path.join(__dirname, 'uploads', req.file.filename);
                const fileContent = extractFileContent(filePath, originalname);

                let finalCommand;
                if (fileContent !== null) {
                    // 文本内容直接嵌入，避免 AI 通过 URL fetch
                    const truncated = fileContent.length > 8000 ? fileContent.substring(0, 8000) + '\n[...文件过长，已截断...]' : fileContent;
                    finalCommand = `[Received File: ${originalname}]\n${truncated}`;
                    if (textCommand.trim() !== '') {
                        finalCommand += `\n\n用户附言：${textCommand}`;
                    }
                } else {
                    // 非文本文件（图片/二进制），仍用 URL
                    finalCommand = `[Received File: ${originalname}] ${fullUrl}`;
                    if (textCommand.trim() !== '') {
                        finalCommand += `\n${textCommand}`;
                    }
                }

                // 保存用户消息到历史
                saveChatHistory(username, 'user', fileMsg);
                console.log(`[xcrab upload] ${username} -> 发送文件 ${originalname} (${req.file.size} bytes) 给 xCrab`);
                broadcastXcrabStatus(username, true);

                // 异步发送到 xCrab（不阻塞响应）
                sendToXcrab(finalCommand, sessionId, username, null).catch(err => {
                    console.error(`[xcrab upload] 异步处理失败: ${err.message}`);
                });

                return res.json({ code: 200, message: '发送成功', data: { url: fileUrl, name: originalname, isImage, text: textCommand } });
            }

            // ================================================================
            // OpenClaw (cclaw) 模式：保持原有行为，下发文件 URL 给 cclaw 处理
            // ================================================================
            let finalCommand = `[Received File: ${originalname}] ${fullUrl}`;
            if (textCommand.trim() !== '') {
                finalCommand += `\n${textCommand}`;
            }

            // 下发给 cclaw，带上 username
            clientWs.send(JSON.stringify({ type: 'command', data: finalCommand, sessionId: sessionId, backend: backend, username: username }));

            res.json({ code: 200, message: '发送成功', data: { url: fileUrl, name: originalname, isImage, text: textCommand } });
        } else {
            res.status(404).json({ code: 404, message: '电脑端 cclaw 未在线，无法发送文件' });
        }
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// YOLO+AI 智能分析接口（YOLOv8 检测 + xCrab AI 分析）
app.post('/api/yolo_analyze', upload.single('file'), async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        if (!req.file) {
            return res.status(400).json({ code: 400, message: '请选择文件' });
        }

        const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const encodedFilename = encodeURIComponent(req.file.filename);
        const fileUrl = '/uploads/' + encodedFilename;
        const isImage = req.file.mimetype.startsWith('image/');
        const textCommand = req.body.command || '';
        const sessionId = req.body.sessionId || null;
        const allowVision = req.body.allowVision === 'true'; // MiniMax 视觉工具开关

        if (!isImage) {
            return res.status(400).json({ code: 400, message: 'YOLO 分析仅支持图片文件' });
        }

        // ===== 1. 调用 YOLO 检测 =====
        const yoloUrl = process.env.YOLO_API_URL;
        const filePath = path.join(__dirname, 'uploads', req.file.filename);

        let yoloData = null;
        try {
            const fileBuffer = fs.readFileSync(filePath);
            const fd = new FormData();
            fd.append('image', new Blob([fileBuffer], { type: 'image/jpeg' }), originalname);

            const yoloResp = await fetch(yoloUrl + '/detect_json', {
                method: 'POST',
                body: fd
            });
            if (yoloResp.ok) {
                yoloData = await yoloResp.json();
                console.log('[yolo] 检测完成:', JSON.stringify(yoloData));
            }
        } catch (yoloErr) {
            console.error('[yolo] 调用失败:', yoloErr.message);
        }

        // ===== 2. 构建增强 Prompt =====
        let enhancedPrompt = '[Received File: ' + originalname + '] ' + fileUrl;
        if (yoloData && yoloData.total_count > 0) {
            const counts = yoloData.class_counts || {};
            enhancedPrompt += '\n\nYOLOv8 检测结果：';
            enhancedPrompt += '\n- 总共检测到 ' + yoloData.total_count + ' 个物体';
            const entries = Object.entries(counts);
            if (entries.length > 0) {
                enhancedPrompt += '\n- 各类型数量:';
                for (const [cls, num] of entries) {
                    enhancedPrompt += '\n  - ' + cls + ': ' + num + ' 个';
                }
            }
            const highConf = (yoloData.objects || []).filter(function(o) { return o.confidence > 0.5; }).slice(0, 20);
            if (highConf.length > 0) {
                enhancedPrompt += '\n- 高置信度物体: ' + highConf.map(function(o) { return o.class + '(' + Math.round(o.confidence * 100) + '%)'; }).join(', ');
            }
        } else if (yoloData) {
            enhancedPrompt += '\n\nYOLOv8 检测结果：未检测到任何物体。';
        }
        if (textCommand.trim()) {
            enhancedPrompt += '\n\n用户问题：' + textCommand;
        }
        // 根据 allowVision 决定是否禁止 AI 调用图片理解工具
        if (!allowVision) {
            enhancedPrompt += '\n\n[系统指令] 本次已提供 YOLOv8 检测结果，请勿调用任何图片理解/视觉分析工具，仅基于以上 YOLOv8 检测结果回答用户问题。';
        }

        // ===== 3. 保存文件消息到历史 =====
        const fileMsg = JSON.stringify({
            type: 'image',
            url: fileUrl,
            name: originalname,
            size: req.file.size,
            text: textCommand
        });

        // ===== 4. 发送给 xCrab =====
        saveChatHistory(username, 'user', fileMsg);
        broadcastXcrabStatus(username, true);
        console.log('[yolo] 发送增强 prompt 给 xCrab');
        sendToXcrab(enhancedPrompt, sessionId, username, null).catch(function(err) {
            console.error('[yolo] xCrab 处理失败:', err.message);
        });

        return res.json({
            code: 200,
            message: 'YOLO+AI 分析已启动',
            data: {
                url: fileUrl,
                name: originalname,
                yolo: yoloData || null
            }
        });
    } catch (err) {
        console.error('[yolo] 认证失败:', err.message);
        return res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// 视频识别代理：接收摄像头帧 → 转发 YOLO 检测 → 返回 JSON
// 支持透传 model_type, conf, nms, tracking, smoothing 参数
app.post('/api/yolo_live', upload.single('frame'), async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    try {
        jwt.verify(token, JWT_SECRET);
        if (!req.file) {
            return res.status(400).json({ code: 400, message: '没有图片帧' });
        }

        const filePath = path.join(__dirname, 'uploads', req.file.filename);
        const fileBuffer = fs.readFileSync(filePath);
        const fd = new FormData();
        fd.append('image', new Blob([fileBuffer], { type: 'image/jpeg' }), 'frame.jpg');

        // 透传可选参数（前端可在 body 中传入）
        var extraParams = ['model_type', 'conf', 'nms', 'tracking', 'smoothing'];
        extraParams.forEach(function(p) {
            if (req.body[p] !== undefined) {
                fd.append(p, String(req.body[p]));
            }
        });

        const yoloUrl = process.env.YOLO_API_URL;
        const yoloResp = await fetch(yoloUrl + '/detect_json', { method: 'POST', body: fd });

        // 删除临时帧文件
        fs.unlink(filePath, function() {});

        if (!yoloResp.ok) {
            return res.status(502).json({ code: 502, message: 'YOLO 检测失败' });
        }

        const yoloData = await yoloResp.json();
        return res.json({ code: 200, data: yoloData });
    } catch (err) {
        console.error('[yolo_live] 失败:', err.message);
        return res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// 速度校准代理
app.all('/api/calibrate', async (req, res) => {
    try {
        const yoloUrl = process.env.YOLO_API_URL;
        if (req.method === 'GET') {
            const resp = await fetch(yoloUrl + '/calibrate');
            const data = await resp.json();
            return res.json({ code: 200, data: data });
        } else if (req.method === 'POST') {
            const resp = await fetch(yoloUrl + '/calibrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });
            const data = await resp.json();
            return res.json({ code: 200, data: data });
        }
    } catch (err) {
        console.error('[calibrate] 失败:', err.message);
        return res.status(502).json({ code: 502, message: '校准服务不可用' });
    }
});

// YOLO 模型列表代理
app.get('/api/yolo_models', async (req, res) => {
    try {
        const yoloUrl = process.env.YOLO_API_URL;
        const resp = await fetch(yoloUrl + '/models');
        const data = await resp.json();
        return res.json({ code: 200, data: data });
    } catch (err) {
        return res.status(502).json({ code: 502, message: 'YOLO 服务连接失败' });
    }
});

// YOLO 当前模型代理
app.get('/api/yolo_current_model', async (req, res) => {
    try {
        const yoloUrl = process.env.YOLO_API_URL;
        const resp = await fetch(yoloUrl + '/current_model');
        const data = await resp.json();
        return res.json({ code: 200, data: data });
    } catch (err) {
        return res.status(502).json({ code: 502, message: 'YOLO 服务连接失败' });
    }
});

// YOLO 切换模型代理
app.post('/api/yolo_switch_model', async (req, res) => {
    try {
        const yoloUrl = process.env.YOLO_API_URL;
        const resp = await fetch(yoloUrl + '/switch_model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model_type: req.body.model_type }),
        });
        const data = await resp.json();
        return res.json(data);
    } catch (err) {
        return res.status(502).json({ code: 502, message: 'YOLO 服务连接失败' });
    }
});

// HTTP 接口：cclaw 主动上传文件给用户
app.post('/api/cclaw_upload', upload.single('file'), (req, res) => {
    // 这个接口供本地 cclaw 使用，可以通过 token 验证
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!req.file) {
            return res.status(400).json({ code: 400, message: '请选择文件' });
        }
        
        const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const encodedFilename = encodeURIComponent(req.file.filename);
        const fileUrl = '/uploads/' + encodedFilename;
        
        const protocol = req.headers['x-forwarded-proto'] || req.headers['x-scheme'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.get('host');
        const fullUrl = `${protocol}://${host}${fileUrl}`;

        res.json({ code: 200, message: '上传成功', url: fullUrl, originalname: originalname });
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// 文件下载接口（解决静态文件服务可能因中文编码/反代导致的下载失败）
app.get('/api/file/download', (req, res) => {
    const file = req.query.file;
    const name = req.query.name || file;
    if (!file) return res.status(400).json({ code: 400, message: '缺少文件名' });

    const uploadsDir = path.join(__dirname, 'uploads');
    const decodedFile = decodeURIComponent(file);
    const safeFile = path.basename(decodedFile);
    const filePath = path.join(uploadsDir, safeFile);

    // 先尝试精确匹配（新文件：纯 ASCII 文件名）
    if (fs.existsSync(filePath)) {
        return res.download(filePath, decodeURIComponent(name));
    }

    // 精确匹配失败 → 按前段数字前缀匹配（兼容旧文件的中文编码差异）
    const prefix = safeFile.match(/^\d+-\d+/);
    if (prefix) {
        try {
            const files = fs.readdirSync(uploadsDir);
            const match = files.find(f => f.startsWith(prefix[0]));
            if (match) {
                return res.download(path.join(uploadsDir, match), decodeURIComponent(name));
            }
        } catch(e) {}
    }

    return res.status(404).json({ code: 404, message: '文件不存在或已被删除' });
});

// 处理 multer 错误
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ code: 400, message: '文件大小不能超过 50MB' });
        }
    } else if (err.message === 'IMAGE_TOO_LARGE') {
        return res.status(400).json({ code: 400, message: '图片大小不能超过 10MB' });
    }
    next(err);
});

// HTTP 接口：停止当前执行
app.post('/api/stop', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        const clientWs = clients.get(username);
        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'stop' }));
            // 清除该用户的 cclaw 执行状态缓存，避免网页端轮询到旧状态
            cclawExecStatus.delete(username);
            console.log(`[cclaw 状态] ${username}: 已清除执行状态（用户停止）`);
            res.json({ code: 200, message: '已发送停止指令' });
        } else {
            res.status(404).json({ code: 404, message: '电脑端 cclaw 未在线' });
        }
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// ========== xCrab Gateway 代理 ==========

/** xCrab SSE 会话状态 */
const xcrabSessions = new Map(); // sessionId -> accumulatedText
const xcrabSessionGen = new Map(); // sessionId -> generation counter (防止并发竞态)

/** 向 wclaw SSE 客户端推送 xCrab 消息 */
function pushToWclaw(key, data) {
    if (pendingWebClients.has(key)) {
        pendingWebClients.get(key).forEach(clientRes => {
            try {
                clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch (e) {
                console.log(`[xcrab] SSE 写入失败: ${e.message}`);
            }
        });
    }
}

/** 广播 xCrab 执行状态到通知 SSE，更新工具栏"执行中/空闲"指示器 */
function broadcastXcrabStatus(username, executing) {
    const statusData = {
        executing,
        sessionCount: 0,
        sessions: executing ? [{ sessionId: 'xcrab', startTime: Date.now() }] : [],
        lastChanged: Date.now(),
        lastSeen: Date.now(),
        timestamp: Date.now()
    };
    cclawExecStatus.set(username, statusData);

    if (notificationClients.has(username)) {
        const sseData = JSON.stringify({
            type: 'exec_status',
            executing: statusData.executing,
            sessions: statusData.sessions,
            timestamp: statusData.timestamp
        });
        const arr = notificationClients.get(username);
        for (let i = arr.length - 1; i >= 0; i--) {
            try {
                arr[i].write(`event: status\ndata: ${sseData}\n\n`);
            } catch (e) {
                arr.splice(i, 1);
            }
        }
        if (arr.length === 0) notificationClients.delete(username);
    }
}

/** 发送 xCrab 消息到 xCrab Gateway */
async function sendToXcrab(command, sessionId, username, messages) {
    const key = `${username}_${sessionId}`;

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (XCRAB_TOKEN) headers['Authorization'] = `Bearer ${XCRAB_TOKEN}`;

        const body = { message: command, sessionId };
        if (messages && Array.isArray(messages)) {
            body.messages = messages;
        }
        const resp = await fetch(`${XCRAB_API_URL}/api/chat/stream`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            pushToWclaw(key, { type: 'error', message: `xCrab 请求失败 (${resp.status})`, sessionId });
            console.log(`[xcrab] HTTP ${resp.status}: ${errText}`);
            return;
        }

        // ===== 空闲心跳检测：当 xCrab 长时间无事件时，向前端推送状态 =====
        let lastEventTime = Date.now();
        let stallWarningSent = false;
        let lastHeartbeatIdle = 0;
        var heartbeatCheckInterval = null;

        function onActivity() {
            // 如果之前发送过卡顿警告，先发恢复通知
            if (stallWarningSent) {
                stallWarningSent = false;
                pushToWclaw(key, {
                    type: 'stall_resolved',
                    message: 'xCrab 已恢复响应',
                    sessionId
                });
                console.log(`[xcrab] 会话 ${sessionId} 恢复响应`);
            }
            lastEventTime = Date.now();
            lastHeartbeatIdle = 0;
        }

        heartbeatCheckInterval = setInterval(() => {
            const idleMs = Date.now() - lastEventTime;
            const idleSeconds = Math.floor(idleMs / 1000);

            // 每 15 秒空闲发送一次心跳
            if (idleSeconds >= 15 && idleSeconds - lastHeartbeatIdle >= 15) {
                lastHeartbeatIdle = idleSeconds;
                console.log(`[xcrab] ❤️ 发送心跳: 会话 ${sessionId} 空闲 ${idleSeconds}s`);
                pushToWclaw(key, {
                    type: 'heartbeat',
                    idleSeconds,
                    sessionId
                });
            }

            // 60 秒无响应 → 卡顿警告
            if (idleSeconds >= 60 && !stallWarningSent) {
                stallWarningSent = true;
                console.log(`[xcrab] ⚠️ 卡顿警告: 会话 ${sessionId} 已空闲 ${idleSeconds}s`);
                pushToWclaw(key, {
                    type: 'stall_warning',
                    message: `xCrab 已无响应 ${idleSeconds} 秒，可能卡顿，建议停止后重试`,
                    idleSeconds,
                    sessionId
                });
            }
        }, 5000);

        // 读取 SSE 流
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // 生成递增的世代号，防止旧连接的残留事件污染新的累积文本
        const gen = (xcrabSessionGen.get(sessionId) || 0) + 1;
        xcrabSessionGen.set(sessionId, gen);
        xcrabSessions.set(sessionId, '');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                // SSE 注释行（keepalive 心跳）也算活性事件
                if (trimmed.startsWith(':')) {
                    onActivity();
                    continue;
                }
                if (!trimmed.startsWith('data: ')) continue;

                // 有实际数据到达，重置空闲计时
                onActivity();

                try {
                    const jsonStr = trimmed.slice(6);
                    const data = JSON.parse(jsonStr);

                    switch (data.type) {
                        case 'session':
                            // 忽略，已使用传入的 sessionId
                            break;

                        case 'thinking':
                            // 新轮开始，清空累积文本避免重复
                            xcrabSessions.set(sessionId, '');
                            break;

                        case 'stream':
                            if (data.data && data.data.text && xcrabSessionGen.get(sessionId) === gen) {
                                // xCrab 发送增量字符（Standard OpenAI streaming delta）
                                // 在此累积为完整文本再转发，前端才能正确显示实时思考过程
                                const accumulated = (xcrabSessions.get(sessionId) || '') + data.data.text;
                                xcrabSessions.set(sessionId, accumulated);
                                pushToWclaw(key, {
                                    type: 'stream',
                                    data: { text: accumulated, _sessionId: sessionId },
                                    sessionId,
                                });
                            }
                            break;

                        case 'tool_call':
                            pushToWclaw(key, { type: 'tool_call', data: data.data, sessionId });
                            break;

                        case 'tool_result':
                            pushToWclaw(key, { type: 'tool_result', data: data.data, sessionId });
                            break;

                        case 'tool_progress':
                            pushToWclaw(key, { type: 'tool_progress', data: data.data, sessionId });
                            break;

                        case 'done':
                            if (xcrabSessionGen.get(sessionId) !== gen) break;
                            pushToWclaw(key, { type: 'done', sessionId });
                            xcrabSessions.delete(sessionId);
                            broadcastXcrabStatus(username, false);
                            console.log(`[xcrab] 会话 ${sessionId} 完成`);
                            break;

                        case 'error':
                            if (xcrabSessionGen.get(sessionId) !== gen) break;
                            pushToWclaw(key, {
                                type: 'error',
                                message: data.data?.message || 'xCrab 执行错误',
                                sessionId,
                            });
                            pushToWclaw(key, { type: 'done', sessionId });
                            xcrabSessions.delete(sessionId);
                            broadcastXcrabStatus(username, false);
                            break;

                        case 'stopped':
                            pushToWclaw(key, { type: 'done', sessionId });
                            xcrabSessions.delete(sessionId);
                            broadcastXcrabStatus(username, false);
                            break;
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
    } catch (err) {
        console.log(`[xcrab] 网络错误: ${err.message}`);
        pushToWclaw(key, { type: 'error', message: `xCrab 连接失败: ${err.message}`, sessionId });
        pushToWclaw(key, { type: 'done', sessionId });
        broadcastXcrabStatus(username, false);
    } finally {
        try {
            // 清理心跳检测定时器
            if (heartbeatCheckInterval) {
                clearInterval(heartbeatCheckInterval);
                heartbeatCheckInterval = null;
            }
        } catch (_) {}
        // 确保执行状态被清理（即使流异常结束）
        broadcastXcrabStatus(username, false);
    }
}

/** xCrab 发送消息 */
app.post('/api/xcrab/send', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const { command, sessionId, messages } = req.body;

        if (!command) return res.status(400).json({ code: 400, message: '指令不能为空' });

        // 检查用户手机号是否获得 xCrab 授权
        if (!isCloudAllowed(username)) {
            const [userRows] = await pool.execute('SELECT phone FROM users WHERE username = ?', [username]);
            if (userRows.length > 0 && userRows[0].phone) {
                const [authRows] = await pool.execute('SELECT id FROM authorized_phones WHERE phone = ?', [userRows[0].phone]);
                if (authRows.length === 0) {
                    return res.status(403).json({ code: 403, message: '您的账号未获得 xCrab 使用授权，请联系管理员' });
                }
            } else {
                return res.status(403).json({ code: 403, message: '您的账号未获得 xCrab 使用授权，请联系管理员' });
            }
        }

        // 保存用户消息到历史
        saveChatHistory(username, 'user', command);
        console.log(`[xcrab] ${username} -> 发送给 xCrab: ${command.substring(0, 100)}`);
        broadcastXcrabStatus(username, true);

        // 异步发送到 xCrab（不阻塞响应），携带历史消息作为上下文
        sendToXcrab(command, sessionId, username, messages).catch(err => {
            console.error(`[xcrab] 异步处理失败: ${err.message}`);
        });

        res.json({ code: 200, message: '已发送给 xCrab' });
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
    }
});

/** xCrab 停止执行 */
app.post('/api/xcrab/stop', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;

        // 检查用户手机号是否获得 xCrab 授权
        if (!isCloudAllowed(username)) {
            const [userRows] = await pool.execute('SELECT phone FROM users WHERE username = ?', [username]);
            if (userRows.length > 0 && userRows[0].phone) {
                const [authRows] = await pool.execute('SELECT id FROM authorized_phones WHERE phone = ?', [userRows[0].phone]);
                if (authRows.length === 0) {
                    return res.status(403).json({ code: 403, message: '您的账号未获得 xCrab 使用授权，请联系管理员' });
                }
            } else {
                return res.status(403).json({ code: 403, message: '您的账号未获得 xCrab 使用授权，请联系管理员' });
            }
        }

        // 通知 xCrab 停止
        fetch(`${XCRAB_API_URL}/api/stop`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(XCRAB_TOKEN ? { 'Authorization': `Bearer ${XCRAB_TOKEN}` } : {}),
            },
            body: JSON.stringify({ sessionId: req.body.sessionId || '' }),
        }).catch(() => {});

        broadcastXcrabStatus(username, false);
        console.log(`[xcrab] ${username} -> 停止 xCrab 执行`);
        res.json({ code: 200, message: '已发送停止指令' });
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

/** xCrab 获取当前模型 */
app.get('/api/xcrab/current_model', async (req, res) => {
    try {
        const resp = await fetch(`${XCRAB_API_URL}/api/current_model`, {
            headers: XCRAB_TOKEN ? { 'Authorization': `Bearer ${XCRAB_TOKEN}` } : {},
        });
        const data = await resp.json();
        res.json(data);
    } catch (err) {
        res.status(502).json({ code: 502, message: `xCrab 连接失败: ${err.message}` });
    }
});

/** xCrab 切换模型 */
app.post('/api/xcrab/switch_model', async (req, res) => {
    // 非授权手机号只允许使用 MiniMax-M2.7
    const authHeader = req.headers.authorization;
    if (authHeader) {
        try {
            const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
            const model = req.body.model;
            if (model && model !== 'minimax') {
                const [userRows] = await pool.execute('SELECT phone FROM users WHERE username = ?', [decoded.username]);
                const userPhone = userRows.length > 0 ? userRows[0].phone : null;
                if (userPhone !== '18520937520') {
                    return res.status(403).json({ code: 403, message: '您的手机号无权切换至该模型，仅可使用 MiniMax-M2.7' });
                }
            }
        } catch (e) {}
    }

    try {
        const resp = await fetch(`${XCRAB_API_URL}/api/switch_model`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(XCRAB_TOKEN ? { 'Authorization': `Bearer ${XCRAB_TOKEN}` } : {}),
            },
            body: JSON.stringify(req.body),
        });
        const data = await resp.json();
        res.json(data);
    } catch (err) {
        res.status(502).json({ code: 502, message: `xCrab 连接失败: ${err.message}` });
    }
});

// HTTP 接口：提交反馈
app.post('/api/feedback', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ code: 400, message: '反馈内容不能为空' });
        }
        
        await pool.execute("INSERT INTO feedbacks (username, content) VALUES (?, ?)", [username, content]);
        res.json({ code: 200, message: '感谢您的反馈！' });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            res.status(401).json({ code: 401, message: 'Token 无效' });
        } else {
            res.status(500).json({ code: 500, message: '服务器内部错误' });
        }
    }
});

// HTTP 接口：获取收藏列表
app.get('/api/favorites', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        
        const [rows] = await pool.execute(
            "SELECT id, msg_id, content, created_at FROM favorites WHERE username = ? ORDER BY id DESC",
            [username]
        );
        res.json({ code: 200, data: rows });
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// HTTP 接口：添加/取消收藏
app.post('/api/favorites/toggle', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const { msg_id, content } = req.body;

        if (!msg_id) return res.status(400).json({ code: 400, message: '消息ID不能为空' });

        // 检查是否已收藏
        const [existing] = await pool.execute("SELECT id FROM favorites WHERE username = ? AND msg_id = ?", [username, msg_id]);

        if (existing.length > 0) {
            // 已收藏则取消收藏
            await pool.execute("DELETE FROM favorites WHERE id = ?", [existing[0].id]);
            // 同步到云服务器（异步，不阻塞响应）
            unsyncFavorite(username, msg_id);
            res.json({ code: 200, message: '已取消收藏', data: { action: 'removed' } });
        } else {
            // 未收藏则添加
            if (!content) return res.status(400).json({ code: 400, message: '收藏内容不能为空' });
            await pool.execute("INSERT INTO favorites (username, msg_id, content) VALUES (?, ?, ?)", [username, msg_id, content]);
            // 同步到云服务器（异步，不阻塞响应）
            syncFavorite(username, msg_id, content);
            res.json({ code: 200, message: '收藏成功', data: { action: 'added' } });
        }
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// HTTP 接口：前端心跳检测，判断后端是否存活以及客户端是否在线
app.get('/api/client_status', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ code: 401, message: '未提供 Token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const username = decoded.username;
        const isConnected = clients.has(username);
        const canUseCloud = isCloudAllowed(username);

        // 检查用户手机号是否获得 xCrab 授权
        let isAuthorized = canUseCloud;
        let userPhone = null;
        const [userRows] = await pool.execute('SELECT phone FROM users WHERE username = ?', [username]);
        if (userRows.length > 0) {
            userPhone = userRows[0].phone;
        }
        if (!isAuthorized && userPhone) {
            const [authRows] = await pool.execute('SELECT id FROM authorized_phones WHERE phone = ?', [userPhone]);
            isAuthorized = authRows.length > 0;
        }

        res.json({ code: 200, connected: isConnected, canUseCloud, isAuthorized, phone: userPhone });
    } catch (err) {
        return res.status(401).json({ code: 401, message: 'Token 无效' });
    }
});

// ========== 授权管理 API（仅 ad1009 可用） ==========

/** 校验管理员权限的中间件辅助函数 */
function requireAdmin(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).json({ code: 401, message: '未提供 Token' });
        return null;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!isCloudAllowed(decoded.username)) {
            res.status(403).json({ code: 403, message: '无权限，仅管理员可用' });
            return null;
        }
        return decoded.username;
    } catch (err) {
        res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
        return null;
    }
}

// 获取所有注册用户及其授权状态
app.get('/api/auth_phones/list', async (req, res) => {
    const adminUser = requireAdmin(req, res);
    if (!adminUser) return;

    try {
        const [users] = await pool.execute('SELECT username, phone FROM users ORDER BY created_at DESC');
        const [authRows] = await pool.execute('SELECT phone FROM authorized_phones');
        const authSet = new Set(authRows.map(r => r.phone));

        const data = users.map(u => ({
            username: u.username,
            phone: u.phone || '',
            authorized: u.phone ? authSet.has(u.phone) : false
        }));

        res.json({ code: 200, data });
    } catch (err) {
        console.error('[auth_phones/list] 查询失败:', err.message);
        res.status(500).json({ code: 500, message: '服务器错误' });
    }
});

// 授权某手机号
app.post('/api/auth_phones/authorize', async (req, res) => {
    const adminUser = requireAdmin(req, res);
    if (!adminUser) return;

    const { phone } = req.body;
    if (!phone) return res.status(400).json({ code: 400, message: '手机号不能为空' });

    try {
        await pool.execute('INSERT IGNORE INTO authorized_phones (phone, authorized_by) VALUES (?, ?)', [phone, adminUser]);
        res.json({ code: 200, message: '授权成功' });
    } catch (err) {
        console.error('[auth_phones/authorize] 授权失败:', err.message);
        res.status(500).json({ code: 500, message: '服务器错误' });
    }
});

// 取消授权某手机号
app.post('/api/auth_phones/revoke', async (req, res) => {
    const adminUser = requireAdmin(req, res);
    if (!adminUser) return;

    const { phone } = req.body;
    if (!phone) return res.status(400).json({ code: 400, message: '手机号不能为空' });

    try {
        await pool.execute('DELETE FROM authorized_phones WHERE phone = ?', [phone]);
        res.json({ code: 200, message: '已取消授权' });
    } catch (err) {
        console.error('[auth_phones/revoke] 取消授权失败:', err.message);
        res.status(500).json({ code: 500, message: '服务器错误' });
    }
});

// HTTP 接口：接收 cclaw 执行状态推送（来自 status-monitor.js）
app.post('/api/cclaw_exec_status', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ code: 401, message: '未提供 Token' });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ code: 401, message: 'Token 无效' });
        }

        const username = decoded.username;
        const { executing, sessionCount, sessions, lastChanged, lastSeen, timestamp } = req.body;

        cclawExecStatus.set(username, {
            executing: !!executing,
            sessionCount: sessionCount || 0,
            sessions: sessions || [],
            lastChanged: lastChanged || Date.now(),
            lastSeen: lastSeen || Date.now(),
            timestamp: timestamp || Date.now()
        });

        console.log(`[cclaw 状态] ${username}: ${executing ? '执行中' : '空闲'} (会话数: ${sessionCount || 0})`);
        if (sessions && sessions.length > 0) {
            console.log(`[cclaw 状态] 活跃会话: ${sessions.map(s => s.sessionId).join(', ')}`);
        }
        res.json({ code: 200, message: '状态已更新' });
    });
});

// HTTP 接口：查询 cclaw 执行状态（供 wclaw 轮询）
app.get('/api/cclaw_exec_status', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ code: 401, message: '未提供 Token' });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ code: 401, message: 'Token 无效' });
        }

        const username = decoded.username;
        const status = cclawExecStatus.get(username);

        if (status) {
            res.json({
                code: 200,
                data: status
            });
        } else {
            // 无状态记录，默认返回空闲
            res.json({
                code: 200,
                data: {
                    executing: false,
                    sessionCount: 0,
                    sessions: [],
                    lastChanged: null,
                    lastSeen: null,
                    timestamp: null
                }
            });
        }
    });
});

// HTTP 接口：查询特定会话是否仍在执行（供前端重连时恢复状态）
app.get('/api/session_exec_status', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ code: 401, message: 'Token 无效' });

        const username = decoded.username;
        const sessionId = req.query.sessionId || 'default';
        const key = `${username}_${sessionId}`;

        // 检查 cclaw 是否在线
        const cclawOnline = clients.has(username);
        // 检查全局执行状态
        const globalStatus = cclawExecStatus.get(username);
        const isExecuting = globalStatus ? !!globalStatus.executing : false;

        // 检查是否有活跃的 SSE 客户端
        const hasSseClients = pendingWebClients.has(key) && pendingWebClients.get(key).length > 0;

        // 检查会话活动时间戳
        const activity = sessionActivityTimestamps.get(key);
        const now = Date.now();
        const staleThreshold = 5 * 60 * 1000; // 5分钟无活动视为卡死
        const isStale = activity && (now - activity.lastActivity) > staleThreshold;

        // 检查是否有缓冲消息
        const hasBuffer = messageBuffer.has(key) && messageBuffer.get(key).length > 0;

        // 如果有发送按钮（through pending clients），说明前端在等待结果
        const sseWaiting = pendingWebClients.has(key) && pendingWebClients.get(key).length > 0;

        res.json({
            code: 200,
            data: {
                sessionId,
                cclawOnline,
                isExecuting,
                hasSseClients,
                sseWaiting,
                hasBuffer,
                isStale,
                activityTimestamp: activity ? activity.lastActivity : null,
                startedAt: activity ? activity.startedAt : null,
                globalStatus: globalStatus || null,
                // 如果 cclaw 离线但执行状态还在，说明进程可能意外退出
                cclawExitedUnexpectedly: !cclawOnline && isExecuting
            }
        });
    });
});

// HTTP 接口：清除卡死的会话状态
app.post('/api/session_exec_status/clear', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ code: 401, message: 'Token 无效' });

        const username = decoded.username;
        const sessionId = req.body.sessionId || 'default';
        const key = `${username}_${sessionId}`;

        sessionActivityTimestamps.delete(key);
        // 不清除缓存消息，让前端重连后还能拿到
        res.json({ code: 200, message: '会话状态已清理' });
    });
});

// HTTP 接口：获取当前活跃的通知消息
app.get('/api/notification', async (req, res) => {
    try {
        const [rows] = await pool.execute("SELECT id, content FROM notifications WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1");
        if (rows.length > 0) {
            res.json({ code: 200, data: rows[0] });
        } else {
            res.json({ code: 200, data: null });
        }
    } catch (err) {
        console.error("获取通知失败:", err);
        res.status(500).json({ code: 500, message: '获取通知失败' });
    }
});

// HTTP 接口：获取当前大模型
app.get('/api/current_model', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ code: 401, message: 'Token 无效' });

        const modelName = currentModel === 'deepseek' ? 'deepseek-v4-flash[1M]' : currentModel === 'mimo' ? 'mimo-v2.5-pro[1M]' : 'MiniMax-M2.7';
        res.json({ code: 200, data: { model: currentModel, name: modelName } });
    });
});

// HTTP 接口：一键切换大模型
const { execSync } = require('child_process');
app.post('/api/switch_model', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ code: 401, message: '未提供 Token' });

    let username;
    try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        username = decoded.username;
    } catch (err) {
        return res.status(401).json({ code: 401, message: 'Token 无效或已过期' });
    }

    const { model } = req.body;
    if (!model || !['deepseek', 'minimax', 'mimo'].includes(model)) {
        return res.status(400).json({ code: 400, message: '无效的模型参数，请指定 deepseek、minimax 或 mimo' });
    }

    // 非授权手机号只允许使用 MiniMax-M2.7
    if (model !== 'minimax') {
        const [userRows] = await pool.execute('SELECT phone FROM users WHERE username = ?', [username]);
        const userPhone = userRows.length > 0 ? userRows[0].phone : null;
        if (userPhone !== '18520937520') {
            return res.status(403).json({ code: 403, message: '您的手机号无权切换至该模型，仅可使用 MiniMax-M2.7' });
        }
    }

    const scriptPath = process.platform === 'win32'
        ? 'D:\\Cclaw\\switch-model.js'
        : '/home/ubuntu/switch-model.js';
    if (!fs.existsSync(scriptPath)) {
        return res.status(500).json({ code: 500, message: '脚本文件不存在: ' + scriptPath });
    }

    const modelName = model === 'deepseek' ? 'deepseek-v4-flash[1M]' : model === 'mimo' ? 'mimo-v2.5-pro[1M]' : 'MiniMax-M2.7';
    console.log(`[switch_model] 用户请求切换模型至: ${modelName}`);

    try {
        const output = execSync(`node "${scriptPath}" ${model}`, {
            encoding: 'utf8',
            timeout: 180000, // 3 分钟超时
            cwd: process.platform === 'win32' ? 'D:\\Cclaw' : '/home/ubuntu'
        });
        // 切换成功后更新当前模型状态
        currentModel = model;
        console.log(`[switch_model] 切换成功, 当前模型: ${currentModel}`);
        res.json({ code: 200, message: `已切换至 ${modelName}`, output: output });
    } catch (e) {
        const errMsg = (e.stderr || e.message || '执行失败').trim();
        console.error(`[switch_model] 切换失败: ${errMsg}`);
        res.status(500).json({ code: 500, message: '切换失败: ' + errMsg, output: e.stdout || '' });
    }
});

// ================================================================
// ================================================================
//  HTTP 接口：接收定时任务(cron)投递的消息并转发到网页端 SSE
// ================================================================
// 支持两种调用方式：
//   方式1（直接调用）：POST body: { message: "你好", username: "yzp1009" }
//   方式2（webhook）：POST /api/cron_deliver?username=yzp1009，body 为 CronEvent JSON，
//     message 从 body.summary 提取
app.post('/api/cron_deliver', (req, res) => {
    // 优先从查询参数取 username（webhook 模式），其次从 body
    let username = req.query.username || req.body.username;
    // 优先从 body.message 取文本，其次从 body.summary（webhook CronEvent 格式）
    let message = req.body.message || req.body.summary;

    if (!message) return res.status(400).json({ code: 400, message: '缺少 message/summary 参数' });
    if (!username) return res.status(400).json({ code: 400, message: '缺少 username 参数' });

    require("fs").appendFileSync("/tmp/cron_webhook.log", new Date().toISOString() + " WEBHOOK_RECEIVED: " + JSON.stringify(req.body).substring(0,500) + "\n");
    console.log(`[cron_deliver] 收到定时任务消息: "${message.substring(0, 100)}", 用户: ${username}`);

    let deliveredCount = 0;

    // 方式1：推送到持久化通知 SSE (页面打开期间一直在线)
    if (notificationClients.has(username)) {
        notificationClients.get(username).forEach(clientRes => {
            try {
                clientRes.write(`data: ${JSON.stringify({ type: 'cron_message', message: message })}\n\n`);
                deliveredCount++;
            } catch(e) {
                console.log(`[cron_deliver] 通知SSE写入失败: ${e.message}`);
            }
        });
    }

    // 方式2：推送到活跃的 AI 会话 SSE 连接
    const prefix = `${username}_`;
    for (const [key, clientResList] of pendingWebClients) {
        if (key.startsWith(prefix)) {
            const sessionId = key.slice(prefix.length);
            clientResList.forEach(clientRes => {
                try {
                    clientRes.write(`data: ${JSON.stringify({ type: 'stream', data: { text: `[定时任务] ${message}`, _sessionId: sessionId }, sessionId: sessionId })}\n\n`);
                    deliveredCount++;
                } catch(e) {
                    console.log(`[cron_deliver] SSE 写入失败: ${e.message}`);
                }
            });
        }
    }

    console.log(`[cron_deliver] 已转发到 ${deliveredCount} 个连接`);
    res.json({ code: 200, delivered: deliveredCount });
});

// WebSocket：处理 cclaw 的长连接接入
wss.on('connection', (ws, req) => {
    console.log('有新的 cclaw 尝试连接...');
    
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            // 收到 cclaw 的认证请求
            if (msg.type === 'auth') {
                const { token } = msg.data;
                jwt.verify(token, JWT_SECRET, (err, decoded) => {
                    if (err) {
                        ws.send(JSON.stringify({ type: 'error', message: '认证失败' }));
                        ws.close();
                        return;
                    }
                    const username = decoded.username;
                    clients.set(username, ws);
                    ws.username = username; // 绑定到连接对象
                    console.log(`cclaw 登录成功: ${username}`);
                    ws.send(JSON.stringify({ type: 'auth_success', message: '已连接到 eclaw' }));
                });
            } else if (msg.type === 'stream') {
                const username = ws.username;
                const sessionId = msg.sessionId || 'default';
                const key = `${username}_${sessionId}`;
                // 更新会话活动时间戳
                updateSessionActivity(key);
                const sendData = { type: 'stream', data: msg.data, sessionId: sessionId };
                console.log(`[server stream] raw msg: ${JSON.stringify(msg).substring(0, 200)}, username: ${username}, sessionId: ${sessionId}, key: ${key}, hasPendingClients: ${pendingWebClients.has(key)}`);
                if (pendingWebClients.has(key)) {
                    pendingWebClients.get(key).forEach(clientRes => {
                        console.log(`[server stream] 发送数据: ${JSON.stringify(sendData).substring(0, 200)}`);
                        clientRes.write(`data: ${JSON.stringify(sendData)}\n\n`);
                    });
                } else {
                    // 缓冲消息，等待网页端连接
                    if (!messageBuffer.has(key)) {
                        messageBuffer.set(key, []);
                    }
                    messageBuffer.get(key).push(sendData);
                    // 设置缓冲过期清理（5秒后自动删除）
                    setTimeout(() => {
                        if (messageBuffer.has(key)) {
                            const msgs = messageBuffer.get(key);
                            const idx = msgs.indexOf(sendData);
                            if (idx > -1) msgs.splice(idx, 1);
                            if (msgs.length === 0) messageBuffer.delete(key);
                        }
                    }, BUFFER_TTL);
                    console.log(`[server stream] 缓冲消息，key: ${key}，当前缓冲: ${messageBuffer.get(key).length} 条`);
                }
            } else if (msg.type === 'result') {
                console.log(`收到 cclaw (${ws.username}) 的结果，准备推送到手机端`);
                const username = ws.username;
                const sessionId = msg.sessionId || 'default';
                const key = `${username}_${sessionId}`;
                updateSessionActivity(key);
                console.log(`[server result] raw msg sessionId: ${msg.sessionId}, parsed sessionId: ${sessionId}, key: ${key}, hasPendingClients: ${pendingWebClients.has(key)}`);

                let output = msg.data.stdout || '';
                let error = msg.data.stderr || '';
                output = output.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
                error = error.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();

                if (error) {
                    saveChatHistory(username, 'ai', error, 'error');
                } else {
                    saveChatHistory(username, 'ai', output || '执行完成 (无输出)', 'success');
                }

                if (pendingWebClients.has(key)) {
                    // 不关闭 SSE 连接，保留客户端以接收后续 stream 和 done 事件
                    pendingWebClients.get(key).forEach(clientRes => {
                        try {
                            clientRes.write(`data: ${JSON.stringify({ type: 'result', data: msg.data, sessionId: sessionId })}\n\n`);
                        } catch(e) {
                            console.log(`[server result] 写入失败（客户端可能已断开）: ${e.message}`);
                        }
                    });
                } else {
                    console.log(`[server result] 未找到 key: ${key}`);
                }
            } else if (msg.type === 'subagent_message') {
                // 子 Agent 消息：转发给对应会话的 SSE 客户端
                const username = ws.username;
                const sessionId = msg.sessionId || 'default';
                const key = `${username}_${sessionId}`;
                const sendData = {
                    type: 'subagent_message',
                    data: msg.data,
                    sessionId: sessionId
                };
                console.log(`[server subagent_message] 收到子Agent消息, sessionId: ${sessionId}, agentId: ${msg.data?.agentId || 'unknown'}, type: ${msg.data?.type || 'info'}`);

                if (pendingWebClients.has(key)) {
                    pendingWebClients.get(key).forEach(clientRes => {
                        try {
                            clientRes.write(`data: ${JSON.stringify(sendData)}\n\n`);
                        } catch(e) {
                            console.log(`[server subagent_message] 写入失败（客户端可能已断开）: ${e.message}`);
                        }
                    });
                } else {
                    // 缓冲消息
                    if (!messageBuffer.has(key)) {
                        messageBuffer.set(key, []);
                    }
                    messageBuffer.get(key).push(sendData);
                    setTimeout(() => {
                        if (messageBuffer.has(key)) {
                            const msgs = messageBuffer.get(key);
                            const idx = msgs.indexOf(sendData);
                            if (idx > -1) msgs.splice(idx, 1);
                            if (msgs.length === 0) messageBuffer.delete(key);
                        }
                    }, BUFFER_TTL);
                    console.log(`[server subagent_message] 缓冲消息，key: ${key}`);
                }
            } else if (msg.type === 'done') {
                // done 事件：只发送通知，不关闭 SSE 连接，让连接保持打开
                const username = ws.username;
                const sessionId = msg.sessionId || 'default';
                const key = `${username}_${sessionId}`;
                updateSessionActivity(key);
                const sendData = { type: 'done', data: {}, sessionId: sessionId };
                console.log(`[server done] 会话 ${sessionId} 已完成，发送通知但保持 SSE 连接`);

                if (pendingWebClients.has(key)) {
                    pendingWebClients.get(key).forEach(clientRes => {
                        try {
                            clientRes.write(`data: ${JSON.stringify(sendData)}\n\n`);
                        } catch(e) {
                            console.log(`[server done] 写入失败（客户端可能已断开）: ${e.message}`);
                        }
                    });
                } else {
                    // 缓冲消息
                    if (!messageBuffer.has(key)) {
                        messageBuffer.set(key, []);
                    }
                    messageBuffer.get(key).push(sendData);
                    setTimeout(() => {
                        if (messageBuffer.has(key)) {
                            const msgs = messageBuffer.get(key);
                            const idx = msgs.indexOf(sendData);
                            if (idx > -1) msgs.splice(idx, 1);
                            if (msgs.length === 0) messageBuffer.delete(key);
                        }
                    }, BUFFER_TTL);
                    console.log(`[server done] 缓冲消息，key: ${key}`);
                }
            } else if (msg.type === 'status_update') {
                // 来自 cclaw 的执行状态（经由 status-monitor → cclaw 本地 API → WebSocket 转发）
                const username = ws.username;
                if (!username) return;
            } else if (msg.type === 'status_update') {
                // 来自 cclaw 的执行状态（经由 status-monitor → cclaw 本地 API → WebSocket 转发）
                const username = ws.username;
                if (!username) return;
                const d = msg.data || {};
                // 如果是执行结束状态，标记所有活跃会话的活动时间戳
                if (!d.executing) {
                    // 遍历该用户的所有会话，标记最后活动时间
                    for (const [k] of pendingWebClients) {
                        if (k.startsWith(`${username}_`)) {
                            updateSessionActivity(k);
                        }
                    }
                } else {
                    // 执行开始，为活跃会话记录开始时间
                    const activeSessions = d.sessions || [];
                    const now = Date.now();
                    for (const s of activeSessions) {
                        const sessionKey = `${username}_${s.sessionId}`;
                        updateSessionActivity(sessionKey, now);
                    }
                }
                const statusData = {
                    executing: !!d.executing,
                    sessionCount: d.sessionCount || 0,
                    sessions: d.sessions || [],
                    lastChanged: d.lastChanged || Date.now(),
                    lastSeen: d.lastSeen || Date.now(),
                    timestamp: d.timestamp || Date.now()
                };
                cclawExecStatus.set(username, statusData);

                // 推送执行状态变更给前端的 notification SSE
                if (notificationClients.has(username)) {
                    const sseData = JSON.stringify({
                        type: 'exec_status',
                        executing: statusData.executing,
                        sessions: statusData.sessions,
                        timestamp: statusData.timestamp
                    });
                    const arr = notificationClients.get(username);
                    for (let i = arr.length - 1; i >= 0; i--) {
                        try {
                            arr[i].write(`event: status\ndata: ${sseData}\n\n`);
                        } catch (e) {
                            arr.splice(i, 1);
                        }
                    }
                    if (arr.length === 0) notificationClients.delete(username);
                }
            }
        } catch (e) {
            console.error('WebSocket 消息解析错误:', e);
        }
    });

    ws.on('error', (err) => {
        console.error(`cclaw WebSocket 错误${ws.username ? ' (' + ws.username + ')' : ''}:`, err.message);
        // error 后主动清理，避免幽灵连接
        if (ws.username) {
            const username = ws.username;
            clients.delete(username);
            cclawExecStatus.delete(username);

            // 通知前端执行端已掉线
            if (notificationClients.has(username)) {
                const offlineData = JSON.stringify({
                    type: 'cclaw_offline',
                    message: '执行端连接异常，任务可能中断',
                    timestamp: Date.now()
                });
                const arr = notificationClients.get(username);
                for (let i = arr.length - 1; i >= 0; i--) {
                    try {
                        arr[i].write(`event: status\ndata: ${offlineData}\n\n`);
                    } catch (e) {
                        arr.splice(i, 1);
                    }
                }
                if (arr.length === 0) notificationClients.delete(username);
            }
        }
    });

    ws.on('close', () => {
        if (ws.username) {
            const username = ws.username;
            clients.delete(username);
            // cclaw 离线时也清除执行状态缓存
            cclawExecStatus.delete(username);
            console.log(`cclaw 离线: ${username}（已清除执行状态）`);

            // 通知前端的 notification SSE：执行端已离线
            if (notificationClients.has(username)) {
                const offlineData = JSON.stringify({
                    type: 'cclaw_offline',
                    message: '执行端已离线，任务可能中断',
                    timestamp: Date.now()
                });
                const arr = notificationClients.get(username);
                for (let i = arr.length - 1; i >= 0; i--) {
                    try {
                        arr[i].write(`event: status\ndata: ${offlineData}\n\n`);
                    } catch (e) {
                        arr.splice(i, 1);
                    }
                }
                if (arr.length === 0) notificationClients.delete(username);
            }
        }
    });
});

// 启动服务（Nginx 反向代理 10090 到本端口）
const PORT = 10001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`eclaw 中间件服务启动成功！`);
    console.log(`wclaw 网页地址: http://localhost:${PORT}`);
    console.log(`WebSocket 地址: ws://localhost:${PORT}/ws`);
});