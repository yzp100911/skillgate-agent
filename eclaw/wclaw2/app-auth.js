    function updateLoginUI() {
        const u = document.getElementById('username').value;
        const phoneGroup = document.getElementById('phone-group');
        const smsGroup = document.getElementById('sms-group');
        const rememberGroup = document.getElementById('remember-group');
        
        if (currentTab === 'login') {
            rememberGroup.style.display = 'flex';
            if (deviceToken && lastTrustedUser && u === lastTrustedUser) {
                phoneGroup.style.display = 'none';
                smsGroup.style.display = 'none';
            } else {
                phoneGroup.style.display = 'block';
                smsGroup.style.display = 'flex';
            }
        } else {
            rememberGroup.style.display = 'none';
            phoneGroup.style.display = 'block';
            smsGroup.style.display = 'flex';
        }
    }

        async function checkUsername() {
        if (currentTab !== 'register') return;
        const u = document.getElementById('username').value;
        if (!u) return;
        
        const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,7}$/;
        if (!usernameRegex.test(u)) {
            return showAlert('error', '用户名称最多只能是7个字符（支持中文、英文、数字）');
        }
        
        try {
            const res = await fetch(host + '/api/check_username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && data.exist) {
                showAlert('error', data.message);
            }
        } catch (e) {
            console.error('检测账号失败', e);
        }
    }

    window.onload = function() {
        if (savedUser && savedPwd) {
            document.getElementById('username').value = savedUser;
            document.getElementById('password').value = savedPwd;
            document.getElementById('remember-pwd').checked = true;
        }
        
        document.getElementById('username').addEventListener('input', updateLoginUI);
        document.getElementById('username').addEventListener('blur', checkUsername);
        updateLoginUI();
        
        checkNotification();
        startHeartbeat();
        startRemoteStatusPolling();

        // 远程执行计时器：每 100ms 更新一次状态栏时间（仅当当前会话在远程执行列表中）
        setInterval(() => {
            if (currentSessionId in remoteExecutingSessions) {
                const sessionState = getSessionState(currentSessionId);
                if (!sessionState.isExecuting) {
                    // 只更新远程计时，不干扰本地执行的计时器
                    updateSendBtnBySessionState();
                }
            }
        }, 100);
    };

    window.addEventListener('beforeunload', function() {
        Object.values(sessionStates).forEach(state => {
            if (state.eventSource) {
                state.eventSource.close();
                state.eventSource = null;
            }
        });
    });

    function startHeartbeat() {
        setInterval(async () => {
            const banner = document.getElementById('connection-error-banner');
            
            if (!currentToken) return;

            try {
                const res = await fetch(host + '/api/client_status?t=' + Date.now(), {
                    headers: { 'Authorization': 'Bearer ' + currentToken },
                    signal: AbortSignal.timeout(3000)
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.code === 200) {
                        heartbeatFailures = 0;

                        // 更新云端权限状态（仅用于展示信息）
                        if (data.canUseCloud !== undefined) {
                            currentCanUseCloud = data.canUseCloud;
                        }

                        if (data.connected) {
                            banner.style.display = 'none';
                        } else {
                            banner.style.display = 'none';
                            document.getElementById('cclaw-warning-modal').style.display = 'flex';

                            if (document.getElementById('stop-btn').style.display === 'flex') {
                                resetSendBtn();
                                const sessionState = getSessionState(currentSessionId);
                                if (sessionState.eventSource) {
                                    sessionState.eventSource.close();
                                    sessionState.eventSource = null;
                                }
                                if (sessionState.msgId) {
                                    updateHistoryError(sessionState.msgId.replace('reply-', ''), '客户端已断开连接，任务意外终止');
                                    sessionState.msgId = null;
                                }
                            }
                        }
                    } else if (data.code === 401) {
                        heartbeatFailures++;
                        if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
                            showAlert('error', '登录已过期，请重新登录');
                            setTimeout(() => location.reload(), 2000);
                        }
                    }
                } else {
                    handleHeartbeatFailure(banner);
                }
            } catch (e) {
                handleHeartbeatFailure(banner);
            }
        }, HEARTBEAT_INTERVAL);
    }

    function handleHeartbeatFailure(banner) {
        heartbeatFailures++;
        console.log(`心跳检测失败 ${heartbeatFailures}/${MAX_HEARTBEAT_FAILURES}`);
        
        if (heartbeatFailures >= MAX_HEARTBEAT_FAILURES) {
            banner.style.display = 'block';
            
            if (document.getElementById('stop-btn').style.display === 'flex') {
                resetSendBtn();
                const sessionState = getSessionState(currentSessionId);
                if (sessionState.eventSource) {
                    sessionState.eventSource.close();
                    sessionState.eventSource = null;
                }
                if (sessionState.msgId) {
                    updateHistoryError(sessionState.msgId.replace('reply-', ''), '与服务器连接丢失，正在尝试恢复...');
                    sessionState.msgId = null;
                }
            }
            
            setTimeout(async () => {
                try {
                    const res = await fetch(host + '/api/client_status?t=' + Date.now(), {
                        headers: { 'Authorization': 'Bearer ' + currentToken },
                        signal: AbortSignal.timeout(3000)
                    });
                    if (res.ok) {
                        heartbeatFailures = 0;
                        banner.style.display = 'none';
                        showAlert('success', '连接已恢复');
                    }
                } catch (e) {
                    console.log('自动恢复连接失败');
                }
            }, 3000);
        } else {
            banner.style.display = 'block';
        }
    }

    // 轮询远端 cclaw 执行状态（来自 status-monitor.js → 云端 /api/cclaw_exec_status）
    function startRemoteStatusPolling() {
        setInterval(async () => {
            if (!currentToken) return;

            try {
                const res = await fetch(host + '/api/cclaw_exec_status?t=' + Date.now(), {
                    headers: { 'Authorization': 'Bearer ' + currentToken },
                    signal: AbortSignal.timeout(3000)
                });
                if (res.ok) {
                    const body = await res.json();
                    if (body.code === 200 && body.data) {
                        const statusEl = document.getElementById('remote-exec-status');
                        if (!statusEl) return;

                        const { executing, sessions, lastChanged } = body.data;
                        const remoteSessionIds = (sessions || []).map(s => s.sessionId).filter(Boolean);

                        // 更新远程会话列表：新增的会话记录开始时间，已结束的移除
                        const prevRemoteSessions = Object.keys(remoteExecutingSessions);

                        // 新增的远程会话（排除用户主动停止的会话）
                        remoteSessionIds.forEach(sid => {
                            if (!remoteExecutingSessions[sid] && sid !== window._userStoppedSession) {
                                remoteExecutingSessions[sid] = { since: Date.now() };
                            }
                        });

                        // 已结束的远程会话
                        prevRemoteSessions.forEach(sid => {
                            if (!remoteSessionIds.includes(sid)) {
                                delete remoteExecutingSessions[sid];
                            }
                        });

                        // 用户主动停止的会话已不在远程列表中，清除标记
                        if (window._userStoppedSession && !remoteSessionIds.includes(window._userStoppedSession)) {
                            window._userStoppedSession = null;
                        }

                        // 判断当前会话是否在远程执行列表中
                        const isThisSessionRemote = currentSessionId in remoteExecutingSessions;

                        // 更新标题栏指示器（只反映当前会话的远程执行状态）
                        const backendName = typeof currentBackend !== 'undefined' ? (currentBackend === 'hermes' ? 'Hermes' : 'OpenClaw') : 'OpenClaw';
                        if (isThisSessionRemote) {
                            statusEl.className = 'remote-status-executing';
                            statusEl.innerHTML = `<i class="fa-solid fa-cog fa-spin"></i> ${backendName} 执行中`;
                        } else {
                            statusEl.className = 'remote-status-idle';
                            statusEl.innerHTML = '⚪ 空闲';
                        }

                        // 更新当前会话的 UI
                        const sessionState = getSessionState(currentSessionId);
                        if (isThisSessionRemote && !sessionState.isExecuting) {
                            // 当前会话在远程执行中，且本地不认为在执行 → 显示远程执行状态
                            updateSendBtnBySessionState();
                        } else if (!isThisSessionRemote && !sessionState.isExecuting) {
                            // 当前会话不在远程执行中，本地也不在执行 → 恢复空闲状态
                            updateSendBtnBySessionState();
                        } else if (!isThisSessionRemote && sessionState.isExecuting && !sessionState.eventSource && !sessionState.reconnectTimer) {
                            // 远程已空闲但本地仍卡在执行状态，且 SSE 已断开且无重连中 → 本地状态过期，强制恢复
                            sessionState.isExecuting = false;
                            updateSendBtnBySessionState();
                        }
                        // 如果本地正在执行且 SSE 还在连接中，保持本地状态不变
                    }
                }
            } catch (e) {
                // 静默忽略（网络问题等）
            }
        }, 3000);
    }

    async function checkNotification() {
        try {
            const res = await fetch(host + '/api/notification', {
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && data.data) {
                const notification = data.data;
                const isHidden = localStorage.getItem('hide_notification_' + notification.id);
                if (!isHidden) {
                    document.getElementById('notification-content').innerText = notification.content;
                    document.getElementById('notification-modal').style.display = 'flex';
                    document.getElementById('notification-modal').dataset.id = notification.id;
                }
            }
        } catch (e) {
            console.error('获取通知失败', e);
        }
    }

    function closeNotification() {
        document.getElementById('notification-modal').style.display = 'none';
    }

    function hideNotification() {
        const id = document.getElementById('notification-modal').dataset.id;
        if (id) {
            localStorage.setItem('hide_notification_' + id, 'true');
        }
        document.getElementById('notification-modal').style.display = 'none';
    }
    function switchTab(tab) {
        currentTab = tab;
        document.getElementById('tab-login').className = tab === 'login' ? 'tab active' : 'tab';
        document.getElementById('tab-register').className = tab === 'register' ? 'tab active' : 'tab';
        document.getElementById('tab-reset').className = tab === 'reset' ? 'tab active' : 'tab';
        
        let btnText = '连 接';
        if (tab === 'register') btnText = '注 册';
        if (tab === 'reset') btnText = '重 置 密 码';
        document.getElementById('btn-submit').innerText = btnText;
        
        if (tab === 'reset') {
            document.getElementById('password').placeholder = '新密码';
        } else {
            document.getElementById('password').placeholder = '密码';
        }

        const usernameHint = document.getElementById('username-hint');
        if (tab === 'register') {
            if (usernameHint) usernameHint.style.display = 'block';
        } else {
            if (usernameHint) usernameHint.style.display = 'none';
        }

        updateLoginUI();
    }

    function showAlert(type, message) {
        const toast = document.getElementById('toast');
        toast.className = 'alert ' + type;
        toast.innerText = message;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }

    async function sendSms() {
        const u = document.getElementById('username').value;
        if (!u) return showAlert('error', '请输入账号');
        const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,7}$/;
        if (!usernameRegex.test(u)) {
            return showAlert('error', '用户名称最多只能是7个字符（支持中文、英文、数字）');
        }

        if (currentTab === 'login' || currentTab === 'reset') {
            try {
                const resCheck = await fetch(host + '/api/check_username', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: u }),
                    signal: AbortSignal.timeout(10000)
                });
                const dataCheck = await resCheck.json();
                if (dataCheck.code === 200 && !dataCheck.exist) {
                    return showAlert('error', '该账号未注册，请注册');
                }
            } catch (e) {
                return showAlert('error', '网络错误，无法校验账号');
            }
        }

        const phone = document.getElementById('phone').value;
        if (!phone) return showAlert('error', '请输入手机号');
        
        const btn = document.getElementById('btn-send-sms');
        btn.disabled = true;
        let count = 60;
        
        try {
            const res = await fetch(host + '/api/send_sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
                signal: AbortSignal.timeout(15000)
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '验证码已发送');
                btn.innerText = `${count}s`;
                const timer = setInterval(() => {
                    count--;
                    btn.innerText = `${count}s`;
                    if (count <= 0) {
                        clearInterval(timer);
                        btn.disabled = false;
                        btn.innerText = '获取验证码';
                    }
                }, 1000);
            } else {
                showAlert('error', data.message || '发送失败');
                btn.disabled = false;
            }
        } catch (e) {
            showAlert('error', '网络错误');
            btn.disabled = false;
        }
    }

    async function submitAuth() {
        const u = document.getElementById('username').value;
        const p = document.getElementById('password').value;
        const phone = document.getElementById('phone').value;
        const code = document.getElementById('sms_code').value;
        const remember = document.getElementById('remember-pwd').checked;
        
        if (!u || !p) return showAlert('error', '请填写账号和密码');
        
        const usernameRegex = /^[a-zA-Z0-9\u4e00-\u9fa5]{1,7}$/;
        if (!usernameRegex.test(u)) {
            return showAlert('error', '用户名称最多只能是7个字符（支持中文、英文、数字）');
        }
        
        const isLogin = currentTab === 'login';
        const isReset = currentTab === 'reset';
        const requiresSms = document.getElementById('phone-group').style.display !== 'none';
        
        if (requiresSms && (!phone || !code)) {
            return showAlert('error', '请填写完整信息(含验证码)');
        }
        
        let endpoint = isLogin ? '/api/login' : '/api/register';
        if (isReset) endpoint = '/api/reset_password';
        
        const btn = document.getElementById('btn-submit');
        btn.disabled = true;
        btn.innerText = '处理中...';

        let payload = { username: u, password: p, phone, sms_code: code };
        if (isReset) {
            payload = { username: u, new_password: p, phone, sms_code: code };
        } else if (isLogin && !requiresSms && deviceToken) {
            payload.device_token = deviceToken;
        }

        try {
            const res = await fetch(host + endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(15000)
            });
            const data = await res.json();
            
            if (data.code === 200) {
                if (isReset) {
                    showAlert('success', '密码重置成功，请登录');
                    switchTab('login');
                    document.getElementById('password').value = '';
                    document.getElementById('sms_code').value = '';
                } else if (!isLogin) {
                    showAlert('success', '注册成功，请登录');
                    switchTab('login');
                    document.getElementById('sms_code').value = '';
                } else {
                    currentToken = data.data.token;
                    currentUser = data.data.username;
                    currentCanUseCloud = data.data.canUseCloud === true;
                    if (data.data.device_token) {
                        deviceToken = data.data.device_token;
                        localStorage.setItem('wclaw_device_token', deviceToken);
                        lastTrustedUser = u;
                        localStorage.setItem('wclaw_last_trusted_user', lastTrustedUser);
                    }
                    localStorage.setItem('wclaw_token', currentToken);
                    localStorage.setItem('wclaw_user', currentUser);
                    syncTTSSettingsFromServer();
                    
                    if (remember) {
                        localStorage.setItem('wclaw_saved_user', u);
                        localStorage.setItem('wclaw_saved_pwd', p);
                        savedUser = u;
                        savedPwd = p;
                    } else {
                        localStorage.removeItem('wclaw_saved_user');
                        localStorage.removeItem('wclaw_saved_pwd');
                        savedUser = null;
                        savedPwd = null;
                    }
                    
                    showApp();
                    if (typeof connectNotificationSSE === 'function') connectNotificationSSE();
                    if (typeof updateHeaderBackend === 'function') updateHeaderBackend();

                }
            } else {
                if (data.message && data.message.includes('新设备登录')) {
                    document.getElementById('phone-group').style.display = 'block';
                    document.getElementById('sms-group').style.display = 'flex';
                }
                showAlert('error', data.message || '操作失败');
            }
        } catch (e) {
            showAlert('error', '网络错误，请稍后再试');
        } finally {
            btn.disabled = false;
            let btnText = '连 接';
            if (currentTab === 'register') btnText = '注 册';
            if (currentTab === 'reset') btnText = '重 置 密 码';
            btn.innerText = btnText;
        }
    }

    function showApp() {
        document.getElementById('login-area').style.display = 'none';
        document.getElementById('app-area').style.display = 'flex';
        loadSessions();
        fetchCurrentModel();
        // 建立持久化通知 SSE 连接
        connectNotificationSSE();
    }
