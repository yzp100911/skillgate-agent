    var currentBackend = localStorage.getItem('wclaw_backend') || 'xcrab';

    // 诊断：AndroidSMS 接口检测
    (function() {
        if (typeof window !== 'undefined') {
            var hasSms = !!(window.AndroidSMS && window.AndroidSMS.sendSMS);
            console.log('[SMS-DIAG] app-main.js v4 loaded, AndroidSMS.sendSMS available:', hasSms);
        }
    })();

    // SMS 触发检测：提取 @内容@手机号@SMS_go 格式并调用 Android 短信接口
    function trySendSMS(text) {
        if (typeof window === 'undefined' || !window.AndroidSMS || !window.AndroidSMS.sendSMS) return false;
        if (window._smsSent) return false;  // 第一层：内存去重

        var match = text.match(/@([^\n@]+)@(\+?\d{10,15})@SMS_go/);
        if (match) {
            var phone = match[2];
            var msg = match[1].trim();

            // 第二层：sessionStorage 去重（防止 WebView 页面重载导致 _smsSent 丢失）
            try {
                var dedupKey = 'sms_sent_' + phone + '_' + msg;
                if (sessionStorage.getItem(dedupKey)) {
                    console.log('[SMS] sessionStorage 去重拦截');
                    window._smsSent = true;
                    return false;
                }
                sessionStorage.setItem(dedupKey, '1');
                // 30 秒后自动过期，允许同号码同内容重新发送
                setTimeout(function() { sessionStorage.removeItem(dedupKey); }, 3000);
            } catch(e) {}

            try {
                window.AndroidSMS.sendSMS(phone, msg);
                window._smsSent = true;
                console.log('[SMS] 已发送至', phone);
                return true;
            } catch(e) {
                console.error('[SMS] 发送失败:', e);
            }
        }
        return false;
    }

    if (currentToken && currentUser) {
        showApp();
        connectNotificationSSE();
        fetchInitialExecStatus();
        updateTTSButton();
        updateNotifyButton();
    }
    var sidebarHidden = false;

    function updateHeaderBackend() {
        const labelMap = { hermes: 'HM(废弃)', xcrab: 'xCrab', openclaw: 'OC(废弃)' };
        const label = labelMap[currentBackend] || 'OpenClaw';
        const isXcrab = currentBackend === 'xcrab';

        // 更新头部标题
        const headerLabel = document.getElementById('header-backend-label');
        if (headerLabel) headerLabel.textContent = label;

        // 更新头部机器人图标
        const headerIcon = document.getElementById('header-icon');
        const headerIconXcrab = document.getElementById('header-icon-xcrab');
        if (headerIcon && headerIconXcrab) {
            if (isXcrab) {
                headerIcon.style.display = 'none';
                headerIconXcrab.style.display = 'inline';
            } else {
                // OC(废弃)+HM(废弃)：旧图标逻辑已废弃，统一显示 xCrab 图标
                headerIcon.style.display = 'none';
                headerIconXcrab.style.display = 'inline';
                // 旧逻辑保留供参考：
                // headerIcon.src = currentBackend === 'hermes' ? 'icon/Hermes.png' : 'icon/openclaw.png';
                // headerIconXcrab.style.display = 'none';
            }
        }

        // 更新输入框旁的切换按钮
        const agentLabel = document.querySelector('.btn-toggle-agent .agent-label');
        if (agentLabel) agentLabel.textContent = label;
        const agentIndicator = document.querySelector('.btn-toggle-agent .agent-indicator');
        if (agentIndicator) {
            agentIndicator.className = 'agent-indicator ' + currentBackend;
        }

        // 更新下拉菜单里的切换按钮
        const toggleLabel = document.querySelector('.toggle-agent-label');
        if (toggleLabel) toggleLabel.textContent = ' ' + label;
        const dropdownIcon = document.getElementById('dropdown-icon');
        const dropdownIconXcrab = document.getElementById('dropdown-icon-xcrab');
        if (dropdownIcon && dropdownIconXcrab) {
            if (isXcrab) {
                dropdownIcon.style.display = 'none';
                dropdownIconXcrab.style.display = 'inline';
            } else {
                // OC(废弃)+HM(废弃)：旧图标逻辑已废弃，统一显示 xCrab 图标
                dropdownIcon.style.display = 'none';
                dropdownIconXcrab.style.display = 'inline';
                // 旧逻辑保留供参考：
                // dropdownIcon.src = currentBackend === 'hermes' ? 'icon/Hermes.png' : 'icon/openclaw.png';
                // dropdownIconXcrab.style.display = 'none';
            }
        }
    }

    // 获取并显示当前大模型
    async function fetchCurrentModel() {
        if (!currentToken) return;
        try {
            // xCrab 后端走 xCrab 的 API
            const apiEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/current_model' : '/api/current_model';
            const res = await fetch(host + apiEndpoint, {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                const badge = document.getElementById('current-model-badge');
                if (badge) {
                    const displayMap = { 'deepseek-v4-flash[1M]': 'DS', 'MiniMax-M2.7': 'MM', 'mimo-v2.5-pro[1M]': 'MIMO' };
                    badge.textContent = displayMap[data.data.name] || data.data.name;
                }
            }
        } catch (e) {
            console.error('获取当前模型失败:', e);
        }
    }
    if (document.readyState === 'complete') {
        updateHeaderBackend();
    } else {
        window.addEventListener('load', updateHeaderBackend);
    }

    function toggleBackend() {
        // 检查当前会话是否正在执行任务
        const sessionState = getSessionState(currentSessionId);
        const isThisSessionRemote =
            currentSessionId in remoteExecutingSessions &&
            remoteExecutingSessions[currentSessionId] &&
            remoteExecutingSessions[currentSessionId].since;
        if (sessionState.isExecuting || !!isThisSessionRemote) {
            showToast('warning', '当前会话正在执行任务，请等待完成后再切换平台');
            return;
        }

        // 三个平台循环：openclaw -> hermes -> xcrab -> openclaw
        const next = { openclaw: 'hermes', hermes: 'xcrab', xcrab: 'openclaw' };
        currentBackend = next[currentBackend] || 'openclaw';
        localStorage.setItem('wclaw_backend', currentBackend);
        // 保存到当前会话
        const curSession = sessions.find(s => s.id === currentSessionId);
        if (curSession) {
            curSession.backend = currentBackend;
            saveSessions();
        }
        updateHeaderBackend();
        const labelMap = { hermes: 'HM(废弃)', xcrab: 'xCrab', openclaw: 'OC(废弃)' };
        showToast('info', '已切换到 ' + (labelMap[currentBackend] || 'OpenClaw'));
    }

    // 移动端消息操作按钮下拉菜单切换
    function toggleMsgActions(btn) {
        const dropdown = btn.nextElementSibling;
        if (!dropdown) return;

        // 关闭其他已打开的下拉菜单时同步清理遮罩
        document.querySelectorAll('.msg-actions-dropdown.open').forEach(d => {
            if (d !== dropdown) {
                d.classList.remove('open');
            }
        });
        document.querySelectorAll('.msg-actions-backdrop').forEach(el => el.remove());

        if (dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
        } else {
            dropdown.classList.add('open');
            // 添加半透明遮罩
            const backdrop = document.createElement('div');
            backdrop.className = 'msg-actions-backdrop';
            backdrop.addEventListener('click', function() {
                dropdown.classList.remove('open');
                document.body.removeChild(backdrop);
            });
            document.body.appendChild(backdrop);
        }
    }

    function toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        if (window.innerWidth > 768) {
            sidebar.classList.toggle('hidden');
        } else {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('open');
        }
    }

    function closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }

    function toggleSidebarDesktop() {
        const sidebar = document.getElementById('sidebar');
        const toggleIcon = document.getElementById('sidebar-toggle-icon');
        
        sidebarHidden = !sidebarHidden;
        
        if (sidebarHidden) {
            sidebar.classList.add('hidden');
            toggleIcon.classList.remove('fa-chevron-left');
            toggleIcon.classList.add('fa-chevron-right');
        } else {
            sidebar.classList.remove('hidden');
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-left');
        }
    }

    function loadSessions() {
        if (!currentUser) return;
        const sessionsKey = 'wclaw_sessions_' + currentUser;
        sessions = JSON.parse(localStorage.getItem(sessionsKey) || '[]');
        
        // Migration: check if old history exists
        const oldHistoryKey = 'wclaw_history_' + currentUser;
        const oldHistory = localStorage.getItem(oldHistoryKey);
        if (oldHistory && sessions.length === 0) {
            const defaultSessionId = 'session_default';
            sessions.push({
                id: defaultSessionId,
                title: '默认对话',
                timestamp: Date.now()
            });
            localStorage.setItem('wclaw_history_' + currentUser + '_' + defaultSessionId, oldHistory);
            localStorage.removeItem(oldHistoryKey);
        }
        
        if (sessions.length === 0) {
            createNewSession(true);
        } else {
            currentSessionId = localStorage.getItem('wclaw_current_session_' + currentUser) || sessions[0].id;
            if (!sessions.find(s => s.id === currentSessionId)) {
                currentSessionId = sessions[0].id;
            }
            // 恢复当前会话的平台
            const curSession = sessions.find(s => s.id === currentSessionId);
            if (curSession && curSession.backend) {
                currentBackend = curSession.backend;
                localStorage.setItem('wclaw_backend', currentBackend);
                updateHeaderBackend();
            }
            renderSessionList();
            loadHistory();
            // 根据当前会话的状态设置发送按钮
            updateSendBtnBySessionState();
        }
    }

    function saveSessions() {
        if (!currentUser) return;
        const key = 'wclaw_sessions_' + currentUser;
        localStorage.setItem(key, JSON.stringify(sessions));
        localStorage.setItem('wclaw_current_session_' + currentUser, currentSessionId);
    }

    // 通知服务器和 cclaw 有新会话
    async function notifyNewSession(sessionId, title) {
        if (!currentToken) return;
        try {
            await fetch(host + '/api/new_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ sessionId, title }),
                signal: AbortSignal.timeout(10000)
            });
        } catch (e) {
            console.error('通知服务器新会话失败:', e);
        }
    }

    function createNewSession(render = true) {
        const newSession = {
            id: 'session_' + Date.now(),
            title: '新对话',
            timestamp: Date.now(),
            backend: currentBackend
        };
        sessions.unshift(newSession);
        currentSessionId = newSession.id;

        // 初始化新会话的执行状态
        const sessionState = getSessionState(currentSessionId);
        sessionState.isExecuting = false;
        sessionState.msgId = null;

        saveSessions();
        if (render) {
            renderSessionList();
            loadHistory();
            // 根据新会话的状态设置发送按钮
            updateSendBtnBySessionState();
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        }

        // 主动通知服务器和 cclaw 有新会话，提前建立 session 上下文
        notifyNewSession(newSession.id, newSession.title);
    }

    function switchSession(id) {
        if (id === currentSessionId) return;

        const oldSessionId = currentSessionId;

        // 保持旧会话的SSE连接，消息会根据sessionId正确路由
        // 不关闭SSE连接，让AI回复继续接收

        // 保存当前平台到旧会话
        const oldSession = sessions.find(s => s.id === oldSessionId);
        if (oldSession) {
            oldSession.backend = currentBackend;
        }

        // 切换会话
        currentSessionId = id;

        // 恢复新会话的平台
        const newSession = sessions.find(s => s.id === id);
        if (newSession && newSession.backend) {
            currentBackend = newSession.backend;
            localStorage.setItem('wclaw_backend', currentBackend);
            updateHeaderBackend();
        }

        saveSessions();
        renderSessionList();
        loadHistory();

        // 根据新会话的状态设置按钮和状态栏
        updateSendBtnBySessionState();

        // 如果是移动端，关闭侧边栏
        if (window.innerWidth <= 768) {
            closeSidebar();
        }
    }

    function deleteSession(event, id) {
        event.stopPropagation();
        if (!confirm('确定删除此对话吗？')) return;
        
        sessions = sessions.filter(s => s.id !== id);
        localStorage.removeItem('wclaw_history_' + currentUser + '_' + id);
        
        if (sessions.length === 0) {
            createNewSession(true);
            return;
        } else if (currentSessionId === id) {
            currentSessionId = sessions[0].id;
        }
        saveSessions();
        renderSessionList();
        loadHistory();
        // 根据当前会话的状态设置发送按钮
        updateSendBtnBySessionState();
    }

    function renderSessionList() {
        const listEl = document.getElementById('session-list');
        listEl.innerHTML = sessions.map(s => `
            <div class="session-item ${s.id === currentSessionId ? 'active' : ''}" onclick="onSessionItemClick('${s.id}', event)">
                <input type="checkbox" class="session-batch-checkbox" value="${s.id}" onchange="updateSessionBatchCount()" ${isSessionBatchMode ? '' : 'style="display:none"'}>
                <i class="fa-regular fa-message"></i>
                <div class="session-title">${escapeHtml(s.title)}</div>
                <i class="fa-solid fa-xmark btn-delete-session" onclick="deleteSession(event, '${s.id}')" title="删除"></i>
            </div>
        `).join('');
    }

    function onSessionItemClick(id, event) {
        if (isSessionBatchMode) {
            // 如果直接点的是勾选框，让它自己处理，不重复翻转
            if (event.target && event.target.classList.contains('session-batch-checkbox')) {
                return;
            }
            const cb = event.currentTarget.querySelector('.session-batch-checkbox');
            if (cb) {
                cb.checked = !cb.checked;
                updateSessionBatchCount();
            }
            return;
        }
        switchSession(id);
    }

    function startExecutionTimer(sessionId) {
        const statusBar = document.getElementById('status-bar');
        let timerEl = document.getElementById('status-timer');
        const sessionState = getSessionState(sessionId);

        console.log('[startExecutionTimer] 被调用，sessionId:', sessionId, 'currentSessionId:', currentSessionId);

        // 清理该会话之前的计时器
        if (sessionState.executionTimer) {
            clearInterval(sessionState.executionTimer);
            sessionState.executionTimer = null;
        }

        sessionState.executionSeconds = 0;
        sessionState.executionStartTime = Date.now(); // 记录开始时间

        // 只有当目标会话是当前活动会话时才显示状态栏和重置计时器显示
        if (sessionId === currentSessionId) {
            if (statusBar) {
                const statusTextEl = statusBar.querySelector('.status-text');
                if (statusTextEl) {
                    statusTextEl.innerHTML = `正在执行任务... <span id="status-timer">00:00</span>`;
                    // innerHTML 重新创建了 span，重新获取引用
                    timerEl = document.getElementById('status-timer');
                }
                statusBar.style.display = 'flex';
            }
        }

        // 使用基于时间戳的方式更新计时器，解决后台暂停问题
        function updateTimer() {
            if (!sessionState.executionStartTime) return;

            // 计算经过的秒数（基于实际时间差，即使在后台也能正确计算）
            const elapsed = Math.floor((Date.now() - sessionState.executionStartTime) / 1000);
            sessionState.executionSeconds = elapsed;

            const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const s = String(elapsed % 60).padStart(2, '0');
            // 只在目标会话是当前活动会话时才更新显示
            if (sessionId === currentSessionId && timerEl) {
                timerEl.innerText = `${m}:${s}`;
            }
        }

        // 立即执行一次更新
        updateTimer();

        // 每100ms更新一次计时器（使用时间戳计算，即使后台暂停也能恢复正确时间）
        sessionState.executionTimer = setInterval(updateTimer, 100);
    }
    
    function stopExecutionTimer(sessionId) {
        const statusBar = document.getElementById('status-bar');
        const timerEl = document.getElementById('status-timer');
        const sessionState = getSessionState(sessionId);

        console.log('[stopExecutionTimer] 被调用，sessionId:', sessionId, 'currentSessionId:', currentSessionId);

        if (sessionState.executionTimer) {
            clearInterval(sessionState.executionTimer);
            sessionState.executionTimer = null;
        }

        sessionState.executionStartTime = null; // 清除开始时间

        // 只有当目标会话是当前活动会话，且远程也没有在执行时，才隐藏状态栏
        if (sessionId === currentSessionId && !(currentSessionId in remoteExecutingSessions)) {
            if (statusBar) statusBar.style.display = 'none';
            if (timerEl) timerEl.innerText = '00:00';
        }
    }

    async function stopCommand() {
        const sessionState = getSessionState(currentSessionId);
        // 标记为用户主动停止，防止 SSE onerror 覆盖停止消息
        sessionState.stoppedByUser = true;

        if (sessionState.eventSource) {
            sessionState.eventSource.close();
            sessionState.eventSource = null;
        }
        if (sessionState.reconnectTimer) {
            clearTimeout(sessionState.reconnectTimer);
            sessionState.reconnectTimer = null;
        }
        if (sessionState._idleCheckInterval) {
            clearInterval(sessionState._idleCheckInterval);
            sessionState._idleCheckInterval = null;
        }
        if (sessionState._pollInterval) {
            clearInterval(sessionState._pollInterval);
            sessionState._pollInterval = null;
        }
        // 清理流式渲染状态（RAF + 包装器 + localStorage 节流定时器）
        if (sessionState._streamRaf) { sessionState._streamRaf = false; }
        if (sessionState._lsSaveTimer) { clearTimeout(sessionState._lsSaveTimer); sessionState._lsSaveTimer = null; }
        sessionState.reconnectAttempts = 0;
        resetSendBtn();
        // 隐藏工具状态条
        var _toolBar = document.getElementById('xcrab-tool-bar');
        if (_toolBar) { _toolBar.classList.remove('fade-in'); _toolBar.style.display = 'none'; }

        if (sessionState.msgId) {
            // msgId 可能不带 reply- 前缀（startSSE 覆盖导致），确保正确查找
            const replyId = sessionState.msgId.startsWith('reply-') ? sessionState.msgId : 'reply-' + sessionState.msgId;
            const actualId = sessionState.msgId.startsWith('reply-') ? sessionState.msgId.replace('reply-', '') : sessionState.msgId;
            let replyEl = document.getElementById(replyId);
            if (replyEl) {
                replyEl._streamWrapper = null; // 清理流式渲染包装器引用
                // 使用 accumulatedOutput（保留 <think> 标签），而非 innerText（已丢失标签）
                let currentText = (sessionState.accumulatedOutput || replyEl.innerText).replace(/执行中\.*$/, '').replace(/等待接收端响应\.*$/, '').trim();
                // 补全未闭合的 <think> 标签：避免停止时最后一段思考过程未输出 </think>
                const openCnt = (currentText.match(/<think>/g) || []).length;
                const closeCnt = (currentText.match(/<\/think>/g) || []).length;
                if (openCnt > closeCnt) {
                    currentText += '\n</think>';
                }
                // 复位思考块为折叠状态（done 事件会自动复位，但停止时不走 done 事件）
                localStorage.removeItem('think_expanded');
                if (currentText) {
                    updateHistoryResult(actualId, { stdout: currentText + '\n\n[已手动停止]' });
                } else {
                    updateHistoryError(actualId, '[已手动停止]');
                }
            }
            sessionState.msgId = null;
        }

        try {
            const stopEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/stop' : '/api/stop';
            await fetch(host + stopEndpoint, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            showAlert('success', '已发送停止指令');
        } catch(e) {
            showAlert('error', '停止失败');
        }

        // 标记此会话为用户主动停止，防止远程轮询重新添加
        window._userStoppedSession = currentSessionId;

        // 清理当前会话的远程执行状态，立即恢复 UI
        if (currentSessionId in remoteExecutingSessions) {
            delete remoteExecutingSessions[currentSessionId];
        }
        // 强制恢复按钮和状态栏
        resetSendBtn();

        // 清除 xCrab 卡顿警告条
        var _stallWarn = document.getElementById('xcrab-stall-warning');
        if (_stallWarn) _stallWarn.remove();
    }

    async function addFavorite(iconEl, msgId, encodedText) {
        const text = decodeURIComponent(encodedText);
        try {
            const res = await fetch(host + '/api/favorites/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ msg_id: msgId, content: text }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                if (data.data.action === 'added') {
                    iconEl.classList.add('active');
                    iconEl.style.color = '#FF9500';
                } else {
                    iconEl.classList.remove('active');
                    iconEl.style.color = '';
                }
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
            } else {
                showAlert('error', data.message || '操作失败');
            }
        } catch(e) {
            showAlert('error', '网络错误');
        }
    }

    async function openFavorites() {
        try {
            const res = await fetch(host + '/api/favorites', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                const listEl = document.getElementById('favorites-list');
                if (data.data.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">暂无收藏</div>';
                } else {
                    listEl.innerHTML = data.data.map(item => `
                        <div class="favorite-item" id="fav-item-${item.msg_id}">
                            <div class="favorite-time">
                                <span>${new Date(item.created_at).toLocaleString('zh-CN')}</span>
                                <i class="fa-solid fa-trash btn-unfav" title="取消收藏" onclick="removeFavorite('${item.msg_id}')"></i>
                            </div>
                            <div>${renderMessageContent(item.content)}</div>
                        </div>
                    `).join('');
                }
                document.getElementById('favorites-modal').style.display = 'flex';
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
            }
        } catch (e) {
            showAlert('error', '获取收藏失败');
        }
    }

    async function removeFavorite(msgId) {
        if (!confirm('确定要取消收藏吗？')) return;
        try {
            const res = await fetch(host + '/api/favorites/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ msg_id: msgId, content: '' }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                const el = document.getElementById(`fav-item-${msgId}`);
                if (el) el.remove();

                // 同步取消主界面上的高亮星号
                const starIcon = document.getElementById(`star-${msgId}`);
                if (starIcon) {
                    starIcon.classList.remove('active');
                    starIcon.style.color = '';
                }

                // 检查是否空了
                const listEl = document.getElementById('favorites-list');
                if (listEl.children.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-sub);text-align:center;padding:20px;">暂无收藏</div>';
                }
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
            } else {
                showAlert('error', data.message || '取消失败');
            }
        } catch(e) {
            showAlert('error', '网络错误');
        }
    }

    function copyText(iconEl, encodedText) {
        let text = decodeURIComponent(encodedText);
        try {
            const obj = JSON.parse(text);
            if (obj.type === 'image' || obj.type === 'file') {
                let copyContent = '';
                if (obj.text) {
                    copyContent = obj.text + '\n\n';
                }
                copyContent += host + obj.url;
                text = copyContent;
            }
        } catch(e) {}

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                const oldClass = iconEl.className;
                iconEl.className = 'fa-solid fa-check';
                iconEl.style.color = '#34C759';
                setTimeout(() => {
                    iconEl.className = oldClass;
                    iconEl.style.color = '';
                }, 2000);
            }).catch(err => {
                showAlert('error', '复制失败');
            });
        } else {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                const oldClass = iconEl.className;
                iconEl.className = 'fa-solid fa-check';
                iconEl.style.color = '#34C759';
                setTimeout(() => {
                    iconEl.className = oldClass;
                    iconEl.style.color = '';
                }, 2000);
            } catch (err) {
                showAlert('error', '复制失败');
            }
            document.body.removeChild(textArea);
        }
    }

    // 分享功能
    function shareMessage(iconEl, encodedText) {
        let text = decodeURIComponent(encodedText);
        try {
            const obj = JSON.parse(text);
            if (obj.type === 'image' || obj.type === 'file') {
                text = host + obj.url;
            }
        } catch(e) {}

        // 优先使用Android原生分享接口
        if (window.AndroidShare && window.AndroidShare.shareText) {
            window.AndroidShare.shareText('分享AI回复', text);
        } else if (navigator.share) {
            // fallback: 使用原生分享API（网页端）
            navigator.share({
                title: '分享AI回复',
                text: text
            }).catch(err => {
                console.error('分享失败:', err);
            });
        } else {
            // 最后fallback: 使用mailto分享
            const subject = encodeURIComponent('分享AI回复');
            const body = encodeURIComponent(text);
            const mailtoLink = `mailto:?subject=${subject}&body=${body}`;
            window.location.href = mailtoLink;
        }
    }

    // 选中文本后确认复制功能
    var selectionTimeout = null;
    var lastSelectedText = '';
    
    document.addEventListener('selectionchange', function() {
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : '';

        // 只处理消息气泡内的文本选择
        if (selection && selection.anchorNode) {
            var bubbleEl = selection.anchorNode.parentElement;
            while (bubbleEl && !bubbleEl.classList.contains("msg-bubble")) {
                bubbleEl = bubbleEl.parentElement;
            }
            if (!bubbleEl) return;
        } else {
            return;
        }

        // 清除之前的定时器
        if (selectionTimeout) {
            clearTimeout(selectionTimeout);
        }

        // 如果有选中的文本且长度合理
        if (selectedText.length > 0 && selectedText.length <= 500) {
            lastSelectedText = selectedText;
            // 2秒后显示确认复制提示（等用户完成选文）
            selectionTimeout = setTimeout(function() {
                // 显示自定义复制确认弹窗（避免使用 confirm() 导致丢失用户手势）
                const displayText = selectedText.length > 100 ? selectedText.substring(0, 100) + '...' : selectedText;
                document.getElementById('copy-preview').innerText = '"' + displayText + '"';
                document.getElementById('copy-modal').style.display = 'flex';
                // 存储待复制文本
                document.getElementById('copy-modal').dataset.text = selectedText;
            }, 1500);
        }
    });

    // 复制弹窗：取消
    function closeCopyModal() {
        document.getElementById('copy-modal').style.display = 'none';
    }

    // 复制弹窗：确认复制
    function confirmCopy() {
        const text = document.getElementById('copy-modal').dataset.text;
        document.getElementById('copy-modal').style.display = 'none';
        if (!text) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showAlert('success', '复制成功！');
            }).catch(err => {
                console.error('复制失败:', err);
                showAlert('error', '复制失败');
            });
        } else {
            // fallback方法
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            textArea.style.top = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                showAlert('success', '复制成功！');
            } catch (err) {
                console.error('复制失败:', err);
                showAlert('error', '复制失败');
            }
            document.body.removeChild(textArea);
        }
    }

    // 选中文本后引用
    function quoteSelectedText() {
        const text = document.getElementById('copy-modal').dataset.text;
        document.getElementById('copy-modal').style.display = 'none';
        if (!text) return;

        // 清除已有的引用指示器
        const existingIndicator = document.querySelector('.quote-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        quotedMessage = { msgId: 'selected-' + Date.now(), content: text, role: 'selected' };

        const quoteLabel = '引用文本';
        const quoteIndicator = document.createElement('div');
        quoteIndicator.className = 'quote-indicator';
        quoteIndicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; overflow: hidden;">
                <span class="quote-label">${quoteLabel}:</span>
                <span class="quote-content">${escapeHtml(text.substring(0, 100))}${text.length > 100 ? '...' : ''}</span>
            </div>
            <i class="fa-solid fa-xmark btn-close-quote" title="清除引用" onclick="clearQuote()"></i>
        `;

        const inputArea = document.querySelector('.input-area');
        inputArea.insertBefore(quoteIndicator, inputArea.firstChild);

        document.getElementById('command').focus();
    }

    var quotedMessage = null;

    function clearQuote() {
        quotedMessage = null;
        const existingIndicator = document.querySelector('.quote-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
    }

    function quoteMessage(msgId, encodedContent, role) {
        let content = decodeURIComponent(encodedContent);
        try {
            const obj = JSON.parse(content);
            if (obj.type === 'image') {
                content = '[图片] ' + obj.name;
            } else if (obj.type === 'file') {
                content = '[文件] ' + obj.name + (obj.text ? ' - ' + obj.text : '');
            }
        } catch(e) {}
        
        // 引用时过滤掉思考过程 <think>...</think>
        content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        // 引用时去掉末尾的 " Exit"
        if (content.endsWith(' Exit')) {
            content = content.slice(0, -5).trim();
        }
        
        const inputBox = document.getElementById('command');
        
        if (quotedMessage && quotedMessage.msgId === msgId) {
            clearQuote();
            inputBox.focus();
            return;
        }
        
        quotedMessage = { msgId, content, role };
        
        const existingIndicator = document.querySelector('.quote-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        const quoteLabel = role === 'user' ? '引用自己' : '引用 AI';
        const quoteIndicator = document.createElement('div');
        quoteIndicator.className = 'quote-indicator';
        quoteIndicator.innerHTML = `
            <div style="display: flex; align-items: center; gap: 6px; flex: 1; overflow: hidden;">
                <span class="quote-label">${quoteLabel}:</span>
                <span class="quote-content">${escapeHtml(content.substring(0, 100))}${content.length > 100 ? '...' : ''}</span>
            </div>
            <i class="fa-solid fa-xmark btn-close-quote" title="清除引用" onclick="clearQuote()"></i>
        `;
        
        const inputArea = document.querySelector('.input-area');
        inputArea.insertBefore(quoteIndicator, inputArea.firstChild);
        
        inputBox.focus();
    }

    async function submitFeedback() {
        const text = document.getElementById('feedback-text').value.trim();
        if (!text) return showAlert('error', '请输入反馈内容');
        
        try {
            const res = await fetch(host + '/api/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ content: text }),
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                showAlert('success', '反馈提交成功，感谢您的建议！');
                document.getElementById('feedback-modal').style.display = 'none';
                document.getElementById('feedback-text').value = '';
            } else {
                showAlert('error', data.message || '提交失败');
            }
        } catch (e) {
            showAlert('error', '网络错误，请稍后再试');
        }
    }

    // 全局变量用于存储待发送的文件
    var pendingFile = null;
    var yoloEnabled = true;       // YOLOv8检测+大模型回答（默认勾选）
    var minimaxVisionEnabled = false;  // MiniMax 视觉工具（默认不勾选）

    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // 文件大小限制判断（前端初步校验）
        const isImage = file.type.startsWith('image/');
        const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
        if (file.size > maxSize) {
            showAlert('error', isImage ? '图片大小不能超过10MB' : '文件大小不能超过50MB');
            event.target.value = '';
            return;
        }

        // 保存待发送的文件
        pendingFile = file;
        
        // 在输入框上方显示文件预览
        let previewArea = document.getElementById('file-preview-area');
        if (!previewArea) {
            previewArea = document.createElement('div');
            previewArea.id = 'file-preview-area';
            previewArea.style.cssText = 'padding: 8px 16px; background: var(--bg); border-top: 1px solid var(--border); display: flex; align-items: center; gap: 10px; flex-wrap: wrap;';
            const inputArea = document.querySelector('.input-area');
            inputArea.parentNode.insertBefore(previewArea, inputArea);
        }
        
        const isImg = file.type.startsWith('image/');
        let previewHtml = '';
        if (isImg) {
            const url = URL.createObjectURL(file);
            previewHtml = `<div style="position: relative; display: inline-block;">
                <img src="${url}" style="height: 60px; border-radius: 6px; border: 1px solid var(--border);">
                <i class="fa-solid fa-circle-xmark" style="position: absolute; top: -6px; right: -6px; color: var(--danger); cursor: pointer; background: white; border-radius: 50%;" onclick="clearPendingFile()"></i>
            </div>`;
        } else {
            previewHtml = `<div style="position: relative; display: inline-flex; align-items: center; gap: 6px; background: var(--card-bg); padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); font-size: 13px;">
                <i class="fa-solid fa-file-lines"></i>
                <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(file.name)}</span>
                <i class="fa-solid fa-circle-xmark" style="position: absolute; top: -6px; right: -6px; color: var(--danger); cursor: pointer; background: white; border-radius: 50%;" onclick="clearPendingFile()"></i>
            </div>`;
        }
        
        previewArea.innerHTML = previewHtml;

        // 添加 YOLOv8 和 MiniMax 独立开关（仅图片显示该选项）
        if (isImg) {
            var toggleRow = document.getElementById('yolo-toggle-row');
            if (!toggleRow) {
                var toggleDiv = document.createElement('div');
                toggleDiv.id = 'yolo-toggle-row';
                toggleDiv.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:4px;font-size:12px;';
                toggleDiv.innerHTML = [
                    '<label style="cursor:pointer;color:var(--text-sub);display:flex;align-items:center;gap:3px;">',
                    '<input type="checkbox" id="yolo-toggle" checked> YOLOv8检测+大模型回答',
                    '</label>',
                    '<label style="cursor:pointer;color:var(--text-sub);display:flex;align-items:center;gap:3px;">',
                    '<input type="checkbox" id="minimax-toggle"> MiniMax 视觉工具',
                    '</label>'
                ].join('');
                previewArea.appendChild(toggleDiv);
                document.getElementById('yolo-toggle').addEventListener('change', function(e) {
                    yoloEnabled = e.target.checked;
                });
                document.getElementById('minimax-toggle').addEventListener('change', function(e) {
                    minimaxVisionEnabled = e.target.checked;
                });
                yoloEnabled = true;
                minimaxVisionEnabled = false;
            }
        } else {
            // 非图片文件，关闭分析选项
            yoloEnabled = false;
            minimaxVisionEnabled = false;
            var toggleRow = document.getElementById('yolo-toggle-row');
            if (toggleRow) toggleRow.remove();
        }

        event.target.value = ''; // 重置 input 方便下次选同一个文件
        
        // 自动聚焦输入框
        document.getElementById('command').focus();
    }

    function clearPendingFile() {
        pendingFile = null;
        const previewArea = document.getElementById('file-preview-area');
        if (previewArea) {
            previewArea.remove();
        }
    }

    function saveToLocalHistory(msg, sessionId) {
        const targetSessionId = sessionId || currentSessionId;
        if (!currentUser || !targetSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + targetSessionId;
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        // 防止重复：如果同 id 的消息已存在，则不再次添加
        if (msg.id && history.some(m => m.id === msg.id)) return;
        history.push(msg);
        // Keep last 100 messages to prevent storage overflow
        if (history.length > 100) history = history.slice(history.length - 100);
        localStorage.setItem(key, JSON.stringify(history));

        // 如果是存入当前会话，才更新会话标题和侧边栏
        if (targetSessionId === currentSessionId) {
            const session = sessions.find(s => s.id === currentSessionId);
            if (session && session.title === '新对话' && msg.role === 'user') {
                let contentStr = msg.content;
                try {
                    const obj = JSON.parse(contentStr);
                    if (obj.type === 'image' || obj.type === 'file') {
                        session.title = `[文件] ${obj.name}`;
                    } else {
                        session.title = contentStr.substring(0, 15) + (contentStr.length > 15 ? '...' : '');
                    }
                } catch(e) {
                    session.title = contentStr.substring(0, 15) + (contentStr.length > 15 ? '...' : '');
                }
                saveSessions();
                renderSessionList();
            }
        }
    }

    function updateLocalHistory(msgId, updates) {
        if (!currentUser || !currentSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        const idx = history.findIndex(m => m.id === msgId);
        if (idx > -1) {
            history[idx] = { ...history[idx], ...updates };
            localStorage.setItem(key, JSON.stringify(history));
        }
    }

    function removeLocalHistory(msgIds) {
        if (!currentUser || !currentSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        let history = JSON.parse(localStorage.getItem(key) || '[]');
        history = history.filter(m => !msgIds.includes(m.id));
        localStorage.setItem(key, JSON.stringify(history));
    }

    function clearLocalHistory() {
        if (!currentUser || !currentSessionId) return;
        localStorage.removeItem('wclaw_history_' + currentUser + '_' + currentSessionId);
    }

    async function loadHistory() {
        if (!currentUser || !currentSessionId) return;
        const key = 'wclaw_history_' + currentUser + '_' + currentSessionId;
        let localHistory = JSON.parse(localStorage.getItem(key) || '[]');
        
        // Fetch favorites just to mark them in UI
        let favoritesMap = {};
        try {
            const res = await fetch(host + '/api/favorites', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200) {
                data.data.forEach(f => favoritesMap[f.msg_id] = true);
            }
        } catch (e) {}

        const box = document.getElementById('chat-box');
        box.innerHTML = `
            <div class="msg-row ai" id="welcome-msg">
                <div class="msg-bubble">你好！我是 WClaw 控制端。连接已就绪，请输入指令控制本地电脑。</div>
            </div>`;
        
        localHistory.forEach(msg => {
            const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
            const date = new Date(msg.timestamp).toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
            const fullTime = `${date} ${time}`;
            const safeContent = encodeURIComponent(msg.content).replace(/'/g, "%27");
            const isFav = favoritesMap[msg.id] ? true : false;
            const favClass = isFav ? 'active' : '';
            const favStyle = isFav ? 'color: #FF9500;' : '';
            const execTimeDisplay = msg.executionSeconds ? (() => {
                const m = String(Math.floor(msg.executionSeconds / 60)).padStart(2, '0');
                const s = String(msg.executionSeconds % 60).padStart(2, '0');
                return `<span class="exec-time">⏱ ${m}:${s}</span>`;
            })() : '';
            
            const checkboxHtml = `<input type="checkbox" class="batch-checkbox" value="${msg.id}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">`;
            
            if (msg.role === 'user') {
                box.insertAdjacentHTML('beforeend', `
                    <div class="msg-row user" id="row-${msg.id}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                        <div class="msg-wrapper user">
                            <div class="msg-bubble">${renderMessageContent(msg.content, true)}</div>
                            <div class="msg-time">${fullTime}
                                <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msg.id}', '${safeContent}', 'user')"></i>
                                <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeContent}')"></i>
                                <i id="star-${msg.id}" class="fa-regular fa-star btn-action ${favClass}" style="${favStyle}" title="收藏" onclick="addFavorite(this, '${msg.id}', '${safeContent}')"></i>
                                <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msg.id}')"></i>
                            </div>
                        </div>
                        ${checkboxHtml}
                    </div>
                `);
            } else {
                const errorClass = msg.status === 'error' ? 'error' : '';
                const safeContent = encodeURIComponent(msg.content).replace(/'/g, "%27");
                const streamingIndicator = msg.status === 'streaming' ? '<span class="loading-dots"></span>' : '';
                const historyBackend = msg.backend || 'xcrab';
                const historyBadge = historyBackend === 'hermes' ? 'HM(废弃)' : historyBackend === 'xcrab' ? 'xCrab' : historyBackend === 'cron' ? '定时' : 'OC(废弃)';
                box.insertAdjacentHTML('beforeend', `
                    <div class="msg-row ai ${errorClass}" id="row-${msg.id}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                        ${checkboxHtml}
                        <div class="msg-wrapper ai">
                            <div class="msg-bubble">${renderMessageContent(msg.content, false, true)}${streamingIndicator}</div>
                            <div class="msg-time"><span class="backend-badge ${historyBackend}">${historyBadge}</span>${fullTime} ${execTimeDisplay}
                                <img id="play-btn-${msg.id}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:inline;" onclick="handlePlayClick('${msg.id}', '${safeContent}', this)">
                                <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msg.id}', '${safeContent}', 'ai')"></i>
                                <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeContent}')"></i>
                                <i class="fa-solid fa-share btn-action" title="分享" onclick="shareMessage(this, '${safeContent}')"></i>
                                <i id="star-${msg.id}" class="fa-regular fa-star btn-action ${favClass}" style="${favStyle}" title="收藏" onclick="addFavorite(this, '${msg.id}', '${safeContent}')"></i>
                                <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msg.id}')"></i>
                            </div>
                        </div>
                    </div>
                `);
            }
        });
        
        setTimeout(scrollToBottom, 100);
    }

    var isBatchMode = false;

    function toggleBatchDelete() {
        isBatchMode = !isBatchMode;
        const bar = document.getElementById('batch-delete-bar');
        const checkboxes = document.querySelectorAll('.batch-checkbox');
        const btnBatch = document.getElementById('btn-batch-delete');
        
        if (isBatchMode) {
            bar.style.display = 'flex';
            btnBatch.style.background = 'rgba(10, 132, 255, 0.2)';
            checkboxes.forEach(cb => {
                cb.style.display = 'block';
                cb.checked = false;
            });
            updateBatchCount();
        } else {
            bar.style.display = 'none';
            btnBatch.style.background = '';
            checkboxes.forEach(cb => cb.style.display = 'none');
        }
    }

    function updateBatchCount() {
        const count = document.querySelectorAll('.batch-checkbox:checked').length;
        document.getElementById('batch-count').innerText = count;
    }

    function executeBatchDelete() {
        const checked = document.querySelectorAll('.batch-checkbox:checked');
        if (checked.length === 0) {
            return showAlert('error', '请先选择要删除的记录');
        }
        if (confirm('是否删除？')) {
            const idsToDelete = Array.from(checked).map(cb => cb.value);
            removeLocalHistory(idsToDelete);
            idsToDelete.forEach(id => {
                const el = document.getElementById(`row-${id}`);
                if (el) el.remove();
            });
            toggleBatchDelete(); // 退出批量模式
        }
    }

    // ===== 批量删除会话 =====
    function toggleBatchSessionDelete() {
        isSessionBatchMode = !isSessionBatchMode;
        const bar = document.getElementById('batch-session-bar');
        const btnBatch = document.getElementById('btn-batch-session');
        const checkboxes = document.querySelectorAll('.session-batch-checkbox');

        if (isSessionBatchMode) {
            bar.style.display = 'flex';
            btnBatch.style.background = 'rgba(10, 132, 255, 0.2)';
            checkboxes.forEach(cb => {
                cb.style.display = 'block';
                cb.checked = false;
            });
            updateSessionBatchCount();
            var selectAllBtn = document.getElementById('btn-select-all-sessions');
            if (selectAllBtn) selectAllBtn.innerText = '全选';
        } else {
            bar.style.display = 'none';
            btnBatch.style.background = '';
            checkboxes.forEach(cb => cb.style.display = 'none');
        }
    }

    function updateSessionBatchCount() {
        const count = document.querySelectorAll('.session-batch-checkbox:checked').length;
        document.getElementById('session-batch-count').innerText = count;
    }

    function selectAllSessions() {
        const checkboxes = document.querySelectorAll('.session-batch-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateSessionBatchCount();
        // 更新全选按钮文字
        document.getElementById('btn-select-all-sessions').innerText = allChecked ? '全选' : '取消全选';
    }

    function executeBatchSessionDelete() {
        const checked = document.querySelectorAll('.session-batch-checkbox:checked');
        if (checked.length === 0) {
            return showAlert('error', '请先选择要删除的会话');
        }
        if (confirm('确定删除选中的 ' + checked.length + ' 个对话吗？\n对应的聊天记录也会一并删除。')) {
            const idsToDelete = Array.from(checked).map(cb => cb.value);
            idsToDelete.forEach(id => {
                sessions = sessions.filter(s => s.id !== id);
                localStorage.removeItem('wclaw_history_' + currentUser + '_' + id);
            });
            if (sessions.length === 0) {
                createNewSession(true);
            } else if (idsToDelete.includes(currentSessionId)) {
                currentSessionId = sessions[0].id;
                loadHistory();
            }
            saveSessions();
            renderSessionList();
            updateSendBtnBySessionState();
            toggleBatchSessionDelete(); // 退出批量模式
        }
    }

    function deleteMessage(msgId) {
        if (confirm('是否删除？')) {
            removeLocalHistory([msgId]);
            const el = document.getElementById(`row-${msgId}`);
            if (el) el.remove();
        }
    }

    function clearAllHistory() {
        if (confirm('是否清空当前聊天记录？')) {
            clearLocalHistory();
            const box = document.getElementById('chat-box');
            box.innerHTML = `
                <div class="msg-row ai" id="welcome-msg">
                    <div class="msg-bubble">你好！我是 WClaw 控制端。连接已就绪，请输入指令控制本地电脑。</div>
                </div>`;
        }
    }

    function logout() {
        // 清理所有会话的执行状态
        Object.keys(sessionExecutionStates).forEach(sessionId => {
            cleanupSessionState(sessionId);
        });
        sessionExecutionStates = {};
        
        if (executionTimer) {
            clearInterval(executionTimer);
            executionTimer = null;
        }
        heartbeatFailures = 0;
        hideNotice();

        localStorage.removeItem('wclaw_token');
        localStorage.removeItem('wclaw_user');
        currentToken = null;
        currentUser = null;
        currentSessionId = null;
        sessions = [];
        document.getElementById('login-area').style.display = 'flex';
        document.getElementById('app-area').style.display = 'none';
        document.getElementById('connection-error-banner').style.display = 'none';
        
        document.getElementById('chat-box').innerHTML = `
            <div class="msg-row ai">
                <div class="msg-bubble">你好！我是 WClaw 控制端。连接已就绪，请输入指令控制本地电脑。</div>
            </div>`;
    }

    function handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const cmdInput = document.getElementById('command');
            if (cmdInput.value.trim()) {
                sendCommand();
            }
        }
    }

    function autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    function organizeMsgTime() {
        if (window.innerWidth > 768) return;
        document.querySelectorAll('.msg-time').forEach(function(el) {
            if (el.querySelector('.msg-actions')) return;
            var timeWrapper = document.createElement('span');
            timeWrapper.className = 'msg-time-text';
            var actionWrapper = document.createElement('span');
            actionWrapper.className = 'msg-actions';
            var nodes = Array.from(el.childNodes);
            nodes.forEach(function(node) {
                if (node.nodeType === 1 && node.classList.contains('btn-action')) {
                    actionWrapper.appendChild(node);
                } else {
                    timeWrapper.appendChild(node);
                }
            });
            if (timeWrapper.childNodes.length > 0) el.appendChild(timeWrapper);
            if (actionWrapper.childNodes.length > 0) el.appendChild(actionWrapper);
        });
    }

    function scrollToBottom() {
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = chatBox.scrollHeight;
        organizeMsgTime();
    }

    function scrollToTop() {
        const chatBox = document.getElementById('chat-box');
        chatBox.scrollTop = 0;
    }

    // 滚动按钮显示/隐藏控制
    function setupScrollButtons() {
        const chatBox = document.getElementById('chat-box');
        const scrollBtns = document.getElementById('scroll-buttons');
        if (!chatBox || !scrollBtns) return;

        function updateScrollButtons() {
            const isNearTop = chatBox.scrollTop < 50;
            const isNearBottom = chatBox.scrollTop + chatBox.clientHeight >= chatBox.scrollHeight - 50;
            const hasScroll = chatBox.scrollHeight > chatBox.clientHeight;

            if (hasScroll) {
                scrollBtns.style.display = 'flex';
                const btnTop = scrollBtns.querySelector('button:last-child');
                const btnBottom = scrollBtns.querySelector('button:first-child');
                btnTop.style.opacity = isNearTop ? '0.3' : '1';
                btnTop.style.pointerEvents = isNearTop ? 'none' : 'auto';
                btnBottom.style.opacity = isNearBottom ? '0.3' : '1';
                btnBottom.style.pointerEvents = isNearBottom ? 'none' : 'auto';
            } else {
                scrollBtns.style.display = 'none';
            }
        }

        chatBox.addEventListener('scroll', updateScrollButtons);
        updateScrollButtons();
    }

    // 滚动按钮长按切换左右侧
    function setupJumpScrollButtons() {
        const container = document.getElementById('scroll-buttons');
        if (!container) return;

        // 加载保存的位置
        const saved = localStorage.getItem('scrollBtnPos');
        if (saved) {
            try {
                const pos = JSON.parse(saved);
                if (pos.side === 'left') {
                    container.style.left = pos.left || '16px';
                    container.style.right = 'auto';
                } else {
                    container.style.right = pos.right || '16px';
                    container.style.left = 'auto';
                }
                container.style.bottom = pos.bottom || '180px';
            } catch (e) {}
        }

        let timer = null;

        function onPointerDown(e) {
            timer = setTimeout(() => {
                const isOnLeft = container.style.left && container.style.left !== 'auto' && container.style.left !== '';
                if (isOnLeft) {
                    // 跳到右侧
                    container.style.right = '16px';
                    container.style.left = 'auto';
                } else {
                    // 跳到左侧
                    container.style.left = '16px';
                    container.style.right = 'auto';
                }
                // 保存位置
                const pos = {
                    bottom: container.style.bottom || '180px',
                    side: isOnLeft ? 'right' : 'left'
                };
                if (pos.side === 'left') {
                    pos.left = container.style.left;
                } else {
                    pos.right = container.style.right;
                }
                localStorage.setItem('scrollBtnPos', JSON.stringify(pos));
                // 阻止长按后按钮的 onclick 触发
                const prevent = (ce) => {
                    ce.stopPropagation();
                    ce.preventDefault();
                    container.removeEventListener('click', prevent, true);
                };
                container.addEventListener('click', prevent, true);
                e.preventDefault();
            }, 300);
        }

        function onPointerMove(e) {
            if (!timer) return;
            clearTimeout(timer);
            timer = null;
        }

        function onPointerUp() {
            clearTimeout(timer);
            timer = null;
        }

        container.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    // 页面加载时初始化滚动按钮
    (function() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(setupScrollButtons, 500);
                setTimeout(setupJumpScrollButtons, 500);
            });
        } else {
            setTimeout(setupScrollButtons, 500);
            setTimeout(setupJumpScrollButtons, 500);
        }
    })();

    function resetSendBtn(sessionId) {
        const targetSessionId = sessionId || currentSessionId;
        const sessionState = getSessionState(targetSessionId);
        console.log(`[DEBUG resetSendBtn] sessionId: ${sessionId}, targetSessionId: ${targetSessionId}, isExecuting: ${sessionState.isExecuting}, hasEventSource: ${!!sessionState.eventSource}, msgId: ${sessionState.msgId}, new Error().stack`);

        sessionState.isExecuting = false;

        if (targetSessionId === currentSessionId) {
            // 如果远程还在执行当前会话，保持执行状态的 UI
            if (targetSessionId in remoteExecutingSessions) {
                updateSendBtnBySessionState();
                stopExecutionTimer(targetSessionId);
                return;
            }

            const btn = document.getElementById('send-btn');
            const stopBtn = document.getElementById('stop-btn');
            btn.disabled = false;
            btn.style.display = 'flex';
            stopBtn.style.display = 'none';
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        }
        
        stopExecutionTimer(targetSessionId);
    }

    // 根据当前会话状态设置按钮状态（同时考虑本地执行和远程执行）
    function updateSendBtnBySessionState() {
        const sessionState = getSessionState(currentSessionId);
        const btn = document.getElementById('send-btn');
        const stopBtn = document.getElementById('stop-btn');
        const statusBar = document.getElementById('status-bar');
        const timerEl = document.getElementById('status-timer');

        // 检查当前会话是否在远程执行列表中
        const isThisSessionRemote =
            currentSessionId in remoteExecutingSessions &&
            remoteExecutingSessions[currentSessionId] &&
            remoteExecutingSessions[currentSessionId].since;

        const isExecuting = sessionState.isExecuting || !!isThisSessionRemote;

        if (isExecuting) {
            btn.disabled = true;
            btn.style.display = 'none';
            stopBtn.style.display = 'flex';
            if (statusBar) statusBar.style.display = 'flex';

            if (sessionState.isExecuting) {
                // 本地执行：使用会话自己的计时
                const m = String(Math.floor(sessionState.executionSeconds / 60)).padStart(2, '0');
                const s = String(sessionState.executionSeconds % 60).padStart(2, '0');
                if (timerEl) timerEl.innerText = `${m}:${s}`;
            } else if (isThisSessionRemote) {
                // 远程执行：使用本地记录的 since 时间计算
                const elapsed = Math.floor((Date.now() - remoteExecutingSessions[currentSessionId].since) / 1000);
                const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const s = String(elapsed % 60).padStart(2, '0');
                if (timerEl) timerEl.innerText = `${m}:${s}`;
            }
        } else {
            btn.disabled = false;
            btn.style.display = 'flex';
            stopBtn.style.display = 'none';
            stopExecutionTimer(currentSessionId);
        }
    }

    // 更新顶部工具栏的"执行中/空闲"状态（已移除）
    function updateRemoteToolbarStatus(executing) {
        // no-op
    }

    async function sendCommand() {
        const cmdInput = document.getElementById('command');
        const cmd = cmdInput.value.trim();
        window._smsSent = false;  // 重置 SMS 防重复标记

        // 检测 SMS 触发标记 (内容@手机号@SMS_go)，手动输入也会触发发送
        trySendSMS(cmd);

        // 处理 /new 命令：开启新话题（不携带任何历史记录）
        if (cmd === '/new') {
            createNewSession();
            cmdInput.value = '';
            cmdInput.style.height = 'auto';
            return;
        }

        // 如果没有输入文字，且没有待发送文件，则返回
        if (!cmd && !pendingFile) return;

        const btn = document.getElementById('send-btn');
        const stopBtn = document.getElementById('stop-btn');
        if (btn.disabled) return;

        // 设置当前会话的执行状态（清除之前的停止标记，使远程轮询正常工作）
        const sessionState = getSessionState(currentSessionId);
        window._userStoppedSession = null;
        sessionState.isExecuting = true;
        // 清除之前的工具状态条
        var _toolBar = document.getElementById('xcrab-tool-bar');
        if (_toolBar) { _toolBar.classList.remove('fade-in'); _toolBar.style.display = 'none'; }
        // 立即更新工具栏状态，不依赖 SSE 通知
        updateRemoteToolbarStatus(true);
        
        btn.disabled = true;
        btn.style.display = 'none';
        stopBtn.style.display = 'flex';
        
        // 如果有文件，走上传加文字接口；如果只有文字，走纯文字接口
        if (pendingFile) {
            await sendFileWithCommand(cmd);
        } else {
            await sendTextCommand(cmd);
        }
    }

    async function sendTextCommand(cmd) {
        const cmdInput = document.getElementById('command');
        const msgId = 'msg-' + Date.now();
        
        // 保存当前的 sessionId，防止切换会话时消息路由错误
        const activeSessionId = currentSessionId;
        console.log(`[sendTextCommand] msgId: ${msgId}, activeSessionId: ${activeSessionId}, currentSessionId: ${currentSessionId}`);
        
        let quoteContent = null;
        let quoteRole = null;
        if (quotedMessage) {
            quoteContent = quotedMessage.content;
            quoteRole = quotedMessage.role;
            quotedMessage = null;
            const existingIndicator = document.querySelector('.quote-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
        }

        const displayCmd = cmd;
        finalCmd = quoteContent ? `引用消息："${quoteContent}"\n\n${cmd}` : cmd;

        const box = document.getElementById('chat-box');
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        const safeDisplayCmd = encodeURIComponent(displayCmd).replace(/'/g, "%27");
        const quoteLabel = quoteRole === 'ai' ? '引用 AI' : quoteRole === 'user' ? '引用自己' : '引用文本';
        const quoteHtml = quoteContent ? `<div class="msg-quote"><div class="msg-quote-label">${quoteLabel}:</div><div class="msg-quote-content">${escapeHtml(quoteContent.substring(0, 100))}${quoteContent.length > 100 ? '...' : ''}</div></div>` : '';

        saveToLocalHistory({
            id: msgId,
            role: 'user',
            content: quoteContent ? JSON.stringify({type: 'text_with_quote', text: displayCmd, quote: quoteContent, quoteRole: quoteRole}) : displayCmd,
            timestamp: Date.now()
        }, activeSessionId);

        box.insertAdjacentHTML('beforeend', `
            <div class="msg-row user" id="row-${msgId}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                <div class="msg-wrapper user">
                    <div class="msg-bubble">${quoteHtml}${escapeHtml(displayCmd)}</div>
                    <div class="msg-time">${fullTime}
                        <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msgId}', '${safeDisplayCmd}', 'user')"></i>
                        <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeDisplayCmd}')"></i>
                        <i id="star-${msgId}" class="fa-regular fa-star btn-action" title="收藏" onclick="addFavorite(this, '${msgId}', '${safeDisplayCmd}')"></i>
                        <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msgId}')"></i>
                    </div>
                </div>
                <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
            </div>
        `);

        const replyMsgId = `reply-${msgId}`;
        const backendBadge = currentBackend === 'hermes' ? 'Hermes' : currentBackend === 'xcrab' ? 'xCrab' : 'OpenClaw';
        box.insertAdjacentHTML('beforeend', `
            <div class="msg-row ai" id="row-${replyMsgId}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                <input type="checkbox" class="batch-checkbox" value="${replyMsgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                <div class="msg-wrapper ai">
                    <div class="msg-bubble" id="${replyMsgId}">执行中<span class="loading-dots"></span></div>
                    <div class="msg-time" id="time-row-${replyMsgId}">
                        <span class="backend-badge ${currentBackend}">${backendBadge}</span>
                        <img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:none;">
                    </div>
                </div>
            </div>
        `);
        
        const sessionState = getSessionState(activeSessionId);
        sessionState.msgId = replyMsgId;
        sessionState.currentBackend = currentBackend;

        scrollToBottom();
        
        // 重置输入框高度和内容
        cmdInput.value = '';
        cmdInput.style.height = 'auto';
        
            // 优化：先建立 SSE 连接，再发送命令
        // 这样可以避免服务端收到 cclaw 消息时网页端还没建立连接的问题
        startSSE(msgId, activeSessionId);

        // 如果当前是 xCrab 后端，加载历史消息作为上下文
        let historyMessages = null;
        if (currentBackend === 'xcrab' && currentUser) {
            const historyKey = 'wclaw_history_' + currentUser + '_' + activeSessionId;
            try {
                const stored = localStorage.getItem(historyKey);
                if (stored) {
                    const allHistory = JSON.parse(stored);
                    // 取最近 20 条非当前消息的历史作为上下文
                    const recentHistory = allHistory.filter(m => m.id !== msgId).slice(-20);
                    historyMessages = recentHistory.map(m => {
                        let content = typeof m.content === 'string' ? m.content : '';
                        // 过滤 AI 消息中的思考标签和 Exit 后缀，避免传给 xCrab 干扰后续推理
                        if (m.role === 'ai') {
                            content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                            content = content.replace(/\s*Exit\s*$/, '');
                        }
                        return {
                            role: m.role === 'ai' ? 'assistant' : m.role,
                            content: content
                        };
                    }).filter(m => m.content);
                }
            } catch(e) {
                console.warn('[xcrab] 读取历史消息失败:', e);
            }
        }

        const MAX_RETRIES = 2;
        let lastError = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const apiEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/send' : '/api/command';
                const requestBody = { command: finalCmd, sessionId: activeSessionId, backend: currentBackend };
                if (currentBackend === 'xcrab' && historyMessages) {
                    requestBody.messages = historyMessages;
                }
                const res = await fetch(host + apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + currentToken
                    },
                    body: JSON.stringify(requestBody),
                    signal: AbortSignal.timeout(30000)
                });
                const data = await res.json();

                if (data.code !== 200) {
                    if (data.code === 401) {
                        logout();
                        showAlert('error', '登录已过期，请重新登录');
                    } else {
                        updateHistoryError(msgId, data.message || '发送失败');
                    }
                    const sessionState = getSessionState(activeSessionId);
                    if (sessionState.eventSource) {
                        sessionState.eventSource.close();
                        sessionState.eventSource = null;
                    }
                    resetSendBtn(activeSessionId);
                    updateRemoteToolbarStatus(false);
                }
                lastError = null;
                break; // 成功，退出重试循环
            } catch (e) {
                lastError = e;
                if (attempt < MAX_RETRIES) {
                    console.warn(`[sendTextCommand] 第 ${attempt + 1} 次请求失败，${(attempt + 1) * 1000}ms 后重试:`, e.message);
                    await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
                }
            }
        }
        if (lastError) {
            updateHistoryError(msgId, '网络连接失败，请检查服务器');
            const sessionState = getSessionState(activeSessionId);
            if (sessionState.eventSource) {
                sessionState.eventSource.close();
                sessionState.eventSource = null;
            }
            resetSendBtn(activeSessionId);
            updateRemoteToolbarStatus(false);
        }
    }

    async function sendFileWithCommand(cmd) {
        const cmdInput = document.getElementById('command');
        const file = pendingFile;
        const msgId = 'msg-' + Date.now();
        const box = document.getElementById('chat-box');
        
        // 保存当前的 sessionId，防止切换会话时消息路由错误
        const activeSessionId = currentSessionId;
        const sessionState = getSessionState(activeSessionId);
        sessionState.msgId = `reply-${msgId}`;
        sessionState.currentBackend = currentBackend;
        
        let quoteContent = null;
        let quoteRole = null;
        if (quotedMessage) {
            quoteContent = quotedMessage.content;
            quoteRole = quotedMessage.role;
            quotedMessage = null;
            const existingIndicator = document.querySelector('.quote-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
        }
        
        const displayText = cmd;
        let finalCmd = quoteContent ? `引用消息："${quoteContent}"

${cmd}` : cmd;
        const quoteLabel = quoteRole === 'ai' ? '引用 AI' : quoteRole === 'user' ? '引用自己' : '引用文本';
        const quoteHtml = quoteContent ? `<div class="msg-quote"><div class="msg-quote-label">${quoteLabel}:</div><div class="msg-quote-content">${escapeHtml(quoteContent.substring(0, 100))}${quoteContent.length > 100 ? '...' : ''}</div></div>` : '';
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        
        // 界面上展示：[文件] + 用户可能输入的文字（不显示提示词）
        let displayHtml = '';
        if (file.type.startsWith('image/')) {
            const url = URL.createObjectURL(file);
            displayHtml = `<img src="${url}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; display: block;" />`;
        } else {
            displayHtml = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <i class="fa-solid fa-file-lines" style="font-size: 24px;"></i>
                                <span style="font-weight: 500;">${escapeHtml(file.name)}</span>
                           </div>`;
        }
        if (displayText) {
            displayHtml += `<div>${escapeHtml(displayText)}</div>`;
        }
        
        const safeUploadContent = encodeURIComponent(displayText || file.name).replace(/'/g, "%27");
        box.insertAdjacentHTML('beforeend', `
            <div class="msg-row user" id="row-${msgId}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                <div class="msg-wrapper user">
                    <div class="msg-bubble">${quoteHtml}${displayHtml}<br><span id="upload-hint-${msgId}" style="font-size:12px; color:var(--text-sub);">上传中 <span class="loading-dots"></span></span></div>
                    <div class="msg-time">${fullTime}
                        <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeUploadContent}')"></i>
                    </div>
                </div>
                <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
            </div>
        `);
        scrollToBottom();

        // 重置输入区
        cmdInput.value = '';
        cmdInput.style.height = 'auto';
        clearPendingFile();

        const formData = new FormData();
        formData.append('file', file);
        if (finalCmd) formData.append('command', finalCmd);
        if (activeSessionId) formData.append('sessionId', activeSessionId);
        formData.append('backend', currentBackend);

        try {
            // YOLOv8+AI 分析模式：调用 /api/yolo_analyze
            const isYoloMode = yoloEnabled && file.type.startsWith('image/') && currentBackend === 'xcrab';
            const uploadApi = isYoloMode ? '/api/yolo_analyze' : '/api/upload_with_command';
            if (isYoloMode) formData.append('allowVision', String(minimaxVisionEnabled));

            // 使用 XMLHttpRequest 支持上传进度回调
            const data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', host + uploadApi);
                xhr.setRequestHeader('Authorization', 'Bearer ' + currentToken);
                xhr.timeout = 60000;

                xhr.upload.onprogress = function(e) {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        const sizeMB = (e.loaded / 1024 / 1024).toFixed(1);
                        const totalMB = (e.total / 1024 / 1024).toFixed(1);
                        const uploadHint = document.getElementById('upload-hint-' + msgId);
                        if (uploadHint) {
                            uploadHint.innerText = `上传中 ${sizeMB}/${totalMB}MB (${pct}%)`;
                        }
                    }
                };

                xhr.onload = function() {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch(err) { reject(new Error('响应解析失败')); }
                };
                xhr.onerror = function() { reject(new Error('网络错误')); };
                xhr.ontimeout = function() { reject(new Error('上传超时')); };
                xhr.send(formData);
            });
            
            if (data.code === 200) {
                // YOLO 分析模式：在文字前添加检测摘要
                var yoloSuffix = '';
                if (isYoloMode && data.data.yolo) {
                    var yolo = data.data.yolo;
                    if (yolo.total_count > 0) {
                        var clsParts = [];
                        for (var cls in yolo.class_counts) {
                            clsParts.push(cls + '×' + yolo.class_counts[cls]);
                        }
                        yoloSuffix = '[YOLOv8: ' + yolo.total_count + ' 个物体' + (clsParts.length ? ', ' + clsParts.join(', ') : '') + ']';
                    } else {
                        yoloSuffix = '[YOLOv8: 未检测到物体]';
                    }
                }
                var finalDisplayText = yoloSuffix ? (displayText ? yoloSuffix + ' ' + displayText : yoloSuffix) : displayText;

                // 上传成功，更新消息气泡内容（转为标准 JSON 存储格式，以兼容历史记录渲染）
                const row = document.getElementById(`row-${msgId}`);
                if (row) {
                    const displayContent = finalDisplayText ? JSON.stringify({type: data.data.isImage ? 'image' : 'file', url: data.data.url, name: data.data.name, size: file.size, text: finalDisplayText}) : JSON.stringify({type: data.data.isImage ? 'image' : 'file', url: data.data.url, name: data.data.name, size: file.size});
                    const safeDisplayContent = encodeURIComponent(displayContent).replace(/'/g, "%27");

                    row.innerHTML = `
                        <div class="msg-wrapper user">
                            <div class="msg-bubble">${renderMessageContent(displayContent)}</div>
                            <div class="msg-time">${fullTime}
                                <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msgId}', '${safeDisplayContent}', 'user')"></i>
                                <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeDisplayContent}')"></i>
                                <i id="star-${msgId}" class="fa-regular fa-star btn-action" title="收藏" onclick="addFavorite(this, '${msgId}', '${safeDisplayContent}')"></i>
                                <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msgId}')"></i>
                            </div>
                        </div>
                        <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                    `;
                    
                    saveToLocalHistory({
                        id: msgId,
                        role: 'user',
                        content: displayContent,
                        timestamp: Date.now()
                    });
                }
                
                // 等待电脑端回复
                const replyMsgId = `reply-${msgId}`;
                const fileBackendBadge = currentBackend === 'hermes' ? 'Hermes' : currentBackend === 'xcrab' ? 'xCrab' : 'OpenClaw';
                var loadingText = isYoloMode ? 'AI 正在分析图片（YOLOv8检测完成）<span class="loading-dots"></span>' : '等待接收端响应 <span class="loading-dots"></span>';
                box.insertAdjacentHTML('beforeend', `
                    <div class="msg-row ai" id="row-${replyMsgId}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                        <input type="checkbox" class="batch-checkbox" value="${replyMsgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                        <div class="msg-wrapper ai">
                            <div class="msg-bubble" id="${replyMsgId}">${loadingText}</div>
                            <div class="msg-time" id="time-row-${replyMsgId}">
                                <span class="backend-badge ${currentBackend}">${fileBackendBadge}</span>
                            </div>
                        </div>
                    </div>
                `);
                const fileSessionState = getSessionState(activeSessionId);
                fileSessionState.msgId = replyMsgId;
                scrollToBottom();
                startSSE(msgId, activeSessionId);
            } else if (data.code === 401) {
                logout();
                showAlert('error', '登录已过期，请重新登录');
                document.getElementById(`row-${msgId}`).remove();
                resetSendBtn(activeSessionId);
                updateRemoteToolbarStatus(false);
            } else {
                showAlert('error', data.message || '发送失败');
                document.getElementById(`row-${msgId}`).remove();
                resetSendBtn(activeSessionId);
                updateRemoteToolbarStatus(false);
            }
        } catch (e) {
            showAlert('error', '网络连接失败，请检查服务器');
            document.getElementById(`row-${msgId}`).remove();
            resetSendBtn(activeSessionId);
            updateRemoteToolbarStatus(false);
        }
    }

    // 持久化通知 SSE 连接（页面打开期间一直保持，接收定时任务消息、执行状态变更等）
    function connectNotificationSSE() {
        if (!currentToken) return;
        if (window._notificationEventSource) {
            window._notificationEventSource.close();
        }
        if (!window._notifSseFailures) window._notifSseFailures = 0;
        const url = host + '/api/notification_sse?token=' + encodeURIComponent(currentToken);
        const es = new EventSource(url);
        window._notificationEventSource = es;

        es.onopen = function() {
            if (window._notifSseFailures > 0) {
                console.log('[通知SSE] 重连成功');
                hideNotice();
            }
            window._notifSseFailures = 0;
        };

        // 处理命名事件：执行状态变更（exec_status）
        es.addEventListener('status', function(e) {
            try {
                const d = JSON.parse(e.data);
                if (d.type === 'exec_status') {
                    console.log('[通知SSE] 执行状态变更:', d.executing ? '执行中' : '空闲');
                    // 更新远程执行状态
                    const sessionList = d.sessions || [];
                    if (d.executing && sessionList.length > 0) {
                        for (const s of sessionList) {
                            remoteExecutingSessions[s.sessionId] = { since: d.timestamp || Date.now() };
                        }
                    } else if (!d.executing) {
                        // 所有会话执行结束
                        for (const sid in remoteExecutingSessions) {
                            delete remoteExecutingSessions[sid];
                        }
                    }
                    // 更新状态栏
                    const statusBar = document.getElementById('status-bar');
                    if (statusBar && currentSessionId) {
                        if (d.executing && currentSessionId in remoteExecutingSessions) {
                            statusBar.style.display = 'flex';
                            const statusText = statusBar.querySelector('.status-text');
                            if (statusText) {
                                statusText.innerHTML = '📡 远程执行中... <span id="status-timer">00:00</span>';
                            }
                        } else if (!d.executing && !(currentSessionId in remoteExecutingSessions)) {
                            statusBar.style.display = 'none';
                        }
                    }
                } else if (d.type === 'cclaw_offline') {
                    console.warn('[通知SSE] 执行端离线:', d.message);
                    // 如果当前有正在执行的会话，显示离线通知
                    if (currentSessionId && sessionExecutionStates[currentSessionId] && sessionExecutionStates[currentSessionId].isExecuting) {
                        showToast('⚠️ ' + d.message);
                    }
                    // 更新工具栏状态
                    updateRemoteToolbarStatus(false);
                }
            } catch(err) {
                console.error('[通知SSE] 状态事件解析失败:', err);
            }
        });

        // 处理未命名事件（旧版兼容：cron_message）
        es.onmessage = function(ev) {
            try {
                var d = JSON.parse(ev.data);
                if (d.type === 'cron_message') {
                    showToast('📌 ' + d.message);
                    // 保存到历史记录（刷新后不消失）
                    var cronId = 'cron-' + Date.now();
                    saveToLocalHistory({
                        id: cronId,
                        role: 'ai',
                        content: '📌 ' + d.message,
                        timestamp: Date.now(),
                        backend: 'cron'
                    });
                    // 同时添加到聊天气泡
                    var box = document.getElementById('chat-box');
                    if (box) {
                        var timeStr = new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
                        box.insertAdjacentHTML('beforeend', [
                            '<div class="msg-row ai" id="row-' + cronId + '">',
                            '<input type="checkbox" class="batch-checkbox" value="' + cronId + '" style="display:none;">',
                            '<div class="msg-wrapper ai">',
                            '<div class="msg-bubble">📌 ' + escapeHtml(d.message) + '</div>',
                            '<div class="msg-time"><span class="backend-badge cron">定时</span> ' + timeStr + '</div>',
                            '</div></div>'
                        ].join(''));
                        scrollToBottom();
                    }
                }
            } catch(e) {}
        };

        es.onerror = function() {
            window._notifSseFailures = (window._notifSseFailures || 0) + 1;
            console.warn(`[通知SSE] 连接断开 (${window._notifSseFailures} 次)，EventSource 将自动重连`);
            if (window._notifSseFailures >= 5) {
                showNotice('通知服务连接不稳定，部分功能可能受影响');
            }
        };
    }

    // 页面加载时获取初始执行状态，用于恢复断开的 SSE 连接
    async function fetchInitialExecStatus() {
        if (!currentToken) return;
        try {
            const res = await fetch(host + '/api/cclaw_exec_status', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const resp = await res.json();
            if (resp.code === 200 && resp.data && resp.data.executing) {
                const activeSessions = resp.data.sessions || [];
                console.log('[执行恢复] 检测到页面加载时有正在执行的任务:', activeSessions);

                for (const s of activeSessions) {
                    remoteExecutingSessions[s.sessionId] = { since: s.startTime || Date.now() };
                }

                if (currentSessionId && remoteExecutingSessions[currentSessionId]) {
                    const sessionState = getSessionState(currentSessionId);
                    sessionState.isExecuting = true;
                    sessionState.stoppedByUser = false;
                    showNotice('检测到执行端正在运行任务，完成后会自动显示结果');
                    updateRemoteToolbarStatus(true);
                }
            }
        } catch(e) {
            console.error('[执行恢复] 获取状态失败:', e);
        }
    }

    // 简单的 Toast 提示
    function showToast(text) {
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 20px;border-radius:8px;z-index:9999;font-size:14px;max-width:80%;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.3);';
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(function() { el.remove(); }, 4000);
    }

    function startSSE(msgId, targetSessionId, reconnectAttempt = 0) {
        // 使用传入的 sessionId 或当前会话的 ID
        const sessionId = targetSessionId || currentSessionId;
        console.log(`[startSSE] msgId: ${msgId}, targetSessionId: ${targetSessionId}, sessionId: ${sessionId}, currentSessionId: ${currentSessionId}`);
        const sessionState = getSessionState(sessionId);
        
        // 清理之前的 SSE 连接
        if (sessionState.eventSource) sessionState.eventSource.close();
        if (sessionState.reconnectTimer) clearTimeout(sessionState.reconnectTimer);
        if (sessionState._idleCheckInterval) { clearInterval(sessionState._idleCheckInterval); sessionState._idleCheckInterval = null; }

        // 重置所有状态标志，防止上一次执行的状态影响新的 SSE 连接
        sessionState.sseCompleted = false;
        sessionState.stoppedByUser = false;
        sessionState.processedResults.clear();

        // 记录当前正在等待的消息ID
        sessionState.msgId = msgId;

        try {
            startExecutionTimer(sessionId);
        } catch (e) {
            console.error('[startSSE] startExecutionTimer 失败，继续创建 SSE:', e.message);
        }

        const sseUrl = `${host}/api/stream_result?token=${currentToken}&sessionId=${encodeURIComponent(sessionId)}`;
        console.log(`[startSSE] 创建 SSE 连接: ${sseUrl}`);
        sessionState.eventSource = new EventSource(sseUrl);

        // 初次连接时清空输出缓存；重连时保留已有的部分结果
        if (reconnectAttempt === 0) {
            sessionState.accumulatedOutput = '';
            sessionState.thinkContent = '';
        }
        sessionState.streamSavedMsgId = `reply-${msgId}`;
        sessionState.xcrabLastDataTime = Date.now();  // 客户端空闲检测基准时间

        // 客户端侧空闲检测：每 5 秒检查一次是否长时间未收到数据（适用于所有后端）
        if (sessionState._idleCheckInterval) clearInterval(sessionState._idleCheckInterval);
        sessionState._idleCheckInterval = setInterval(function() {
            var _idleSec = Math.floor((Date.now() - (sessionState.xcrabLastDataTime || Date.now())) / 1000);
            if (_idleSec < 15) return;  // 少于 15s 不显示

            var _sBar = document.getElementById('status-bar');
            if (!_sBar) return;
            var _sText = _sBar.querySelector('.status-text');
            if (!_sText) return;

            // 只在状态栏显示"正在执行"时更新（避免覆盖其他状态信息）
            var statusText = _sText.innerHTML;
            if (statusText.indexOf('正在执行任务') === -1 && statusText.indexOf('思考中') === -1 && statusText.indexOf('无响应') === -1) {
                return;
            }

            var backendName = currentBackend === 'xcrab' ? 'xCrab' : currentBackend === 'hermes' ? 'Hermes' : 'OpenClaw';
            _sBar.style.display = 'flex';

            if (_idleSec >= 60) {
                // 客户端侧卡顿检测（所有后端）
                var _warnEl = document.getElementById('xcrab-stall-warning');
                if (!_warnEl) {
                    _warnEl = document.createElement('div');
                    _warnEl.id = 'xcrab-stall-warning';
                    _warnEl.style.cssText = 'position:fixed;top:60px;left:0;right:0;z-index:1000;background:#fff3cd;color:#856404;text-align:center;padding:8px 16px;font-size:13px;border-bottom:1px solid #ffeeba;';
                    document.body.insertBefore(_warnEl, document.body.firstChild);
                }
                _warnEl.innerHTML = '⚠️ ' + backendName + ' 已无响应 ' + _idleSec + ' 秒，可能卡顿或连接中断';
            }
            _sText.innerHTML = '⏳ ' + backendName + ' 无响应（' + _idleSec + 's）<span id="status-timer">...</span>';
        }, 5000);

        // 重连成功时清除断开连接提示
        sessionState.eventSource.onopen = function() {
            if (reconnectAttempt > 0) {
                console.log('[SSE] 重连成功, sessionId:', sessionId);
                // 清除消息气泡中的重连提示
                const replyId = sessionState.msgId ? (sessionState.msgId.startsWith('reply-') ? sessionState.msgId : 'reply-' + sessionState.msgId) : null;
                if (replyId) {
                    const replyEl = document.getElementById(replyId);
                    if (replyEl) {
                        const hint = replyEl.querySelector('.reconnecting-hint');
                        if (hint) hint.remove();
                    }
                }
                // 恢复状态栏为正常执行状态
                const statusBar = document.getElementById('status-bar');
                if (statusBar) {
                    statusBar.style.display = 'flex';
                    const statusText = statusBar.querySelector('.status-text');
                    if (statusText) {
                        statusText.innerHTML = '正在执行任务... <span id="status-timer">' + (function() {
                            const s = sessionState.executionSeconds || 0;
                            return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
                        })() + '</span>';
                    }
                }
                // 清除连接错误横幅
                const banner = document.getElementById('connection-error-banner');
                if (banner) banner.style.display = 'none';
                // 清除状态轮询（如果有）
                if (sessionState._pollInterval) {
                    clearInterval(sessionState._pollInterval);
                    sessionState._pollInterval = null;
                }
            }
        };

        sessionState.eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                const dataSessionId = data.sessionId || 'default';
                const effectiveSessionId = (data.data && data.data._sessionId) || dataSessionId;
                console.log(`[SSE onmessage] type: ${data.type}, dataSessionId: ${dataSessionId}, effectiveSessionId: ${effectiveSessionId}, sessionId: ${sessionId}`);

                // 严格路由：只有 _sessionId 匹配才处理
                if (effectiveSessionId !== sessionId) {
                    console.log(`忽略来自其他会话的消息: effective=${effectiveSessionId} vs sessionId=${sessionId}`);
                    return;
                }

                // 空闲心跳重置：收到有效数据时恢复状态栏显示（适用于所有后端）
                function resetXcrabIdle() {
                    if (sessionState) sessionState.xcrabLastDataTime = Date.now();
                    var _sb = document.getElementById('status-bar');
                    if (_sb) {
                        var _st = _sb.querySelector('.status-text');
                        // 只要状态栏显示"无响应"，就恢复为正常执行状态
                        if (_st && (_st.innerHTML.indexOf('无响应') !== -1)) {
                            _st.innerHTML = '正在执行任务... <span id="status-timer">...</span>';
                        }
                    }
                }

                // ====== 工具信息映射（所有事件类型共享）======
                var _TOOL_INFO = {
                    get_time:       { c: '基础工具', d: '获取当前日期和时间' },
                    calculate:      { c: '基础工具', d: '执行数学计算' },
                    weather:        { c: '基础工具', d: '获取城市实时天气' },
                    web_search:     { c: '基础工具', d: '互联网搜索最新信息' },
                    web_fetch:      { c: '基础工具', d: '获取任意 URL 的内容' },
                    read_file:      { c: '文件操作', d: '读取文件内容' },
                    write_file:     { c: '文件操作', d: '创建/覆盖文件' },
                    append_file:    { c: '文件操作', d: '追加内容到文件' },
                    list_files:     { c: '文件操作', d: '列出目录内容' },
                    run_command:    { c: '文件操作', d: '执行 shell 命令' },
                    remember:       { c: '记忆系统', d: '记住信息（键值对存储）' },
                    recall:         { c: '记忆系统', d: '搜索历史记忆' },
                    read_skill:     { c: '技能管理', d: '加载技能的完整指令' },
                    search_skills:  { c: '技能管理', d: '从 ClawHub 搜索技能' },
                    install_skill:  { c: '技能管理', d: '安装新技能' },
                    uninstall_skill: { c: '技能管理', d: '卸载技能' },
                    configure_skill: { c: '技能管理', d: '查看/修改技能配置' },
                    create_plan:    { c: '高级功能', d: '复杂任务自动拆解多步执行' },
                    render_canvas:  { c: '高级功能', d: '生成图表' },
                    switch_workspace: { c: '高级功能', d: '切换角色/人格' },
                    list_workspaces: { c: '高级功能', d: '列出所有可用角色' },
                };

                if (data.type === 'stream') {
                    resetXcrabIdle();
                    let text = stripAnsi(data.data.text);
                    // 实时累积每个思考过程：提取新 think 块，与已有的去重合并
                    const thinkMatches = text.match(/<think>([\s\S]*?)<\/think>/g);
                    if (thinkMatches) {
                        for (const block of thinkMatches) {
                            const content = block.match(/<think>([\s\S]*?)<\/think>/)[1];
                            if (!sessionState.thinkContent.includes(content)) {
                                if (sessionState.thinkContent && content.includes(sessionState.thinkContent)) {
                                    sessionState.thinkContent = content;
                                } else {
                                    sessionState.thinkContent += (sessionState.thinkContent ? '\n' : '') + content;
                                }
                            }
                        }
                    }
                    const answerPart = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                    const fullText = sessionState.thinkContent
                        ? '<think>' + sessionState.thinkContent + '</think>\n' + answerPart
                        : answerPart;
                    sessionState.accumulatedOutput = fullText;

                    const replyMsgId = `reply-${msgId}`;
                    const currentReplyEl = document.getElementById(replyMsgId);

                    trySendSMS(sessionState.accumulatedOutput);

                    // === RAF 节流渲染：合并同一帧内的多次 stream 事件 ===
                    if (currentReplyEl) {
                        // 首次 stream：初始化内容包装器 + 分离 loading-dots
                        if (!currentReplyEl._streamWrapper) {
                            currentReplyEl.innerHTML = '<div class="msg-stream-content"></div><span class="loading-dots"></span>';
                            currentReplyEl._streamWrapper = currentReplyEl.querySelector('.msg-stream-content');
                            // 事件委托：代码块复制按钮
                            currentReplyEl.addEventListener('click', function(ev) {
                                var cb = ev.target.closest('.code-copy-btn');
                                if (cb) { ev.stopPropagation(); copyCodeBlock(cb); }
                            });
                        }
                        // 标记内容已变化，RAF 回调在下一帧统一渲染
                        if (!sessionState._streamRaf) {
                            sessionState._streamRaf = true;
                            requestAnimationFrame(function() {
                                sessionState._streamRaf = false;
                                var el = document.getElementById(replyMsgId);
                                if (el && el._streamWrapper) {
                                    el._streamWrapper.innerHTML = renderMessageContent(sessionState.accumulatedOutput, true);
                                    scrollToBottom();
                                }
                            });
                        }
                    }

                    // 长连接模式下不自动结束会话，等待 done/result 事件或网络错误

                    // 节流保存到 localStorage（每 2 秒最多写一次）
                    if (!sessionState._lsSaveTimer) {
                        sessionState._lsSaveTimer = setTimeout(function() {
                            sessionState._lsSaveTimer = null;
                            const key = 'wclaw_history_' + currentUser + '_' + sessionId;
                            try {
                                let history = JSON.parse(localStorage.getItem(key) || '[]');
                                let existingIdx = history.findIndex(m => m.id === replyMsgId);
                                if (existingIdx === -1) {
                                    history.push({
                                        id: replyMsgId, role: 'ai',
                                        content: sessionState.accumulatedOutput,
                                        status: 'streaming', timestamp: Date.now(),
                                        backend: sessionState.currentBackend || currentBackend
                                    });
                                } else {
                                    history[existingIdx].content = sessionState.accumulatedOutput;
                                    history[existingIdx].status = 'streaming';
                                }
                                localStorage.setItem(key, JSON.stringify(history));
                            } catch(e) {}
                        }, 2000);
                    }

                } else if (data.type === 'tool_call') {
                    resetXcrabIdle();
                    const _tcName = data.data && data.data.name;
                    const _tcIdx = data.data && data.data.index;
                    const _tcTotal = data.data && data.data.total;
                    const _tcArgs = data.data && data.data.args;
                    const _replyId = 'reply-' + msgId;
                    const _rowEl = document.getElementById('row-' + _replyId);
                    if (_rowEl) {
                        var _dots = _rowEl.querySelector('.loading-dots');
                        if (_dots) _dots.remove();
                    }
                    // 更新输入框上方的工具状态条
                    var _toolBar = document.getElementById('xcrab-tool-bar');
                    var _toolInner = document.getElementById('xcrab-tool-bar-inner');
                    if (_toolBar && _toolInner) {
                        _toolBar.style.display = 'block';
                        // 触发渐入动画
                        _toolBar.classList.remove('fade-in');
                        void _toolBar.offsetWidth;
                        _toolBar.classList.add('fade-in');
                        _toolInner.style.cssText = 'padding:7px 10px;background:#fff8e1;border-radius:6px;font-size:13px;border:1px solid #ffe0b2;';
                        _toolInner.setAttribute('data-tool-info', '');
                        _toolInner.setAttribute('data-tool-args', '');
                        var _stepInfo = _tcTotal > 1 ? ' [' + _tcIdx + '/' + _tcTotal + ']' : '';
                        var _tcInfo = _TOOL_INFO[_tcName];
                        var _infoHtml = '';
                        if (_tcInfo) {
                            _infoHtml = '<span style="color:#bf360c;">[' + escapeHtml(_tcInfo.c) + ']</span> <span style="color:#8d3a00;">' + escapeHtml(_tcInfo.d) + '</span>';
                            _toolInner.setAttribute('data-tool-info', _infoHtml);
                        }
                        var _argsHtml = '';
                        if (_tcArgs) {
                            try {
                                var _parsedArgs = JSON.parse(_tcArgs);
                                var _parts = [];
                                for (var _key in _parsedArgs) {
                                    var _v = String(_parsedArgs[_key]);
                                    if (_v.length > 1000) _v = _v.slice(0, 1000) + '…';
                                    _parts.push('<span style="color:#9e5a00;">' + escapeHtml(_key) + ':</span> ' + escapeHtml(_v));
                                }
                                if (_parts.length > 0) {
                                    _argsHtml = '<span style="color:#7a3b00;">' + _parts.join(' &nbsp;|&nbsp; ') + '</span>';
                                    _toolInner.setAttribute('data-tool-args', _argsHtml);
                                }
                            } catch(e) {}
                        }
                        var _lines = [];
                        _lines.push('<div style="display:flex;align-items:center;gap:6px;color:#e65100;">' +
                            '<span style="flex-shrink:0;">🔧</span> <b>' + escapeHtml(_tcName) + '</b>' + _stepInfo +
                            '<span class="tool-elapsed" style="margin-left:auto;font-weight:bold;">⏱ 0s</span>' +
                        '</div>');
                        if (_infoHtml || _argsHtml) {
                            _lines.push('<div style="font-size:12px;line-height:1.6;padding-left:24px;">' +
                                (_infoHtml ? _infoHtml : '') +
                                (_infoHtml && _argsHtml ? '<br>' : '') +
                                (_argsHtml ? _argsHtml : '') +
                            '</div>');
                        }
                        _toolInner.innerHTML = _lines.join('');
                    }
                } else if (data.type === 'tool_progress') {
                    resetXcrabIdle();
                    var _elapsed = data.data && data.data.elapsed;
                    var _toolInner = document.getElementById('xcrab-tool-bar-inner');
                    if (_toolInner) {
                        var _elapsedEl = _toolInner.querySelector('.tool-elapsed');
                        if (_elapsedEl) _elapsedEl.textContent = '⏱ ' + _elapsed + 's';
                    }
                } else if (data.type === 'tool_result') {
                    resetXcrabIdle();
                    var _resultName = data.data && data.data.name;
                    var _dur = data.data && data.data.durationMs;
                    var _fmtTime = _dur >= 1000 ? (_dur/1000).toFixed(1) + 's' : _dur + 'ms';
                    var _toolInner = document.getElementById('xcrab-tool-bar-inner');
                    if (_toolInner) {
                        _toolInner.style.cssText = 'padding:7px 10px;background:#e8f5e9;border-radius:6px;font-size:13px;border:1px solid #c8e6c9;';
                        var _savedInfo = _toolInner.getAttribute('data-tool-info') || '';
                        var _savedArgs = _toolInner.getAttribute('data-tool-args') || '';
                        var _doneLines = [];
                        _doneLines.push('<div style="display:flex;align-items:center;gap:6px;color:#2e7d32;">' +
                            '<span style="flex-shrink:0;">✅</span> <b>' + escapeHtml(_resultName) + '</b>' +
                            '<span style="margin-left:auto;font-weight:bold;">(' + _fmtTime + ')</span>' +
                        '</div>');
                        if (_savedInfo || _savedArgs) {
                            _doneLines.push('<div style="font-size:12px;line-height:1.6;padding-left:24px;color:#33691e;">' +
                                (_savedInfo ? _savedInfo : '') +
                                (_savedInfo && _savedArgs ? '<br>' : '') +
                                (_savedArgs ? _savedArgs : '') +
                            '</div>');
                        }
                        _toolInner.innerHTML = _doneLines.join('');
                    }
                } else if (data.type === 'result') {
                    console.log('[SSE] 收到 result 事件，准备停止执行计时器');
                    if (sessionState.processedResults.has(msgId)) {
                        console.log(`[SSE] 忽略已处理的 result: ${msgId}`);
                        return;
                    }
                    sessionState.processedResults.add(msgId);

                    if (sessionState.reconnectTimer) clearTimeout(sessionState.reconnectTimer);
                    sessionState.reconnectAttempts = 0;
                    const outputText = (data.data && data.data.stdout) ? data.data.stdout : '';

                    const replyMsgId = `reply-${msgId}`;
                    const resultContent = stripAnsi(outputText).trim() || '执行完成 (无输出)';
                    const finalContent = resultContent + ' Exit';
                    saveToLocalHistory({
                        id: replyMsgId,
                        role: 'ai',
                        content: finalContent,
                        status: 'success',
                        timestamp: Date.now(),
                        executionSeconds: sessionState.executionSeconds,
                        backend: sessionState.currentBackend || currentBackend
                    }, sessionId);

                    // 清理流式渲染状态（RAF + 包装器 + localStorage 节流定时器）
                    if (sessionState._streamRaf) { sessionState._streamRaf = false; }
                    if (sessionState._lsSaveTimer) { clearTimeout(sessionState._lsSaveTimer); sessionState._lsSaveTimer = null; }
                    var _replyEl = document.getElementById(replyMsgId);
                    if (_replyEl) { _replyEl._streamWrapper = null; }

                    updateHistoryResult(msgId, data.data);

                    // AI回复完成
                    stopExecutionTimer(sessionId);
                    showExecutionTime(msgId, sessionId);
                    console.log(`[DEBUG SSE result] sessionId: ${sessionId}, msgId: ${msgId}, will NOT resetSendBtn, isExecuting: ${sessionState.isExecuting}, hasEventSource: ${!!sessionState.eventSource}`);

                    if (sessionState.doneTimeout) {
                        clearTimeout(sessionState.doneTimeout);
                        sessionState.doneTimeout = null;
                    }
                } else if (data.type === 'done') {
                    console.log(`[DEBUG SSE done] sessionId: ${sessionId}, msgId: ${msgId}, sessionState.msgId: ${sessionState.msgId}, isExecuting: ${sessionState.isExecuting}, hasEventSource: ${!!sessionState.eventSource}`);
                    if (sessionState.doneTimeout) {
                        clearTimeout(sessionState.doneTimeout);
                        sessionState.doneTimeout = null;
                    }
                    console.log(`[SSE] 收到 done 事件，会话 ${sessionId} 真正完成`);
                    if (sessionState.reconnectTimer) clearTimeout(sessionState.reconnectTimer);
                    sessionState.reconnectAttempts = 0;
                    sessionState.sseCompleted = true;
                    // 清理空闲检测定时器，防止结束后重新弹出"xCrab 思考中"
                    if (sessionState._idleCheckInterval) {
                        clearInterval(sessionState._idleCheckInterval);
                        sessionState._idleCheckInterval = null;
                    }
                    if (sessionState._pollInterval) {
                        clearInterval(sessionState._pollInterval);
                        sessionState._pollInterval = null;
                    }
                    // 不关闭 SSE 连接 — 保持长连，防止频繁重连
                    // 服务端会在所有客户端断开 30 分钟后自动清理
                    sessionState.msgId = null;
                    // SSE done 代表执行真正结束，清理远程执行标记，防止状态栏重新弹出
                    if (sessionId in remoteExecutingSessions) {
                        delete remoteExecutingSessions[sessionId];
                    }
                    resetSendBtn(sessionId);
                    // 清除卡顿警告横幅（空闲检测定时器虽已清除，但横幅可能已在前端显示）
                    var _stallWarn = document.getElementById('xcrab-stall-warning');
                    if (_stallWarn) _stallWarn.remove();
                    // 隐藏状态栏
                    var _statusBar = document.getElementById('status-bar');
                    if (_statusBar) _statusBar.style.display = 'none';
                    // 隐藏工具状态条
                    var _toolBar = document.getElementById('xcrab-tool-bar');
                    if (_toolBar) { _toolBar.classList.remove('fade-in'); _toolBar.style.display = 'none'; }
                    updateRemoteToolbarStatus(false);
                    showExecutionTime(msgId, sessionId);

                    // 检测 SMS 触发标记（Android App 发送短信）
                    const accumulated = sessionState.accumulatedOutput || '';

                    // 移除 loading 指示器并更新本地历史为完整内容
                    const replyMsgId = `reply-${msgId}`;
                    const replyEl = document.getElementById(replyMsgId);

                    // 检测 SMS 触发标记 (内容@手机号@SMS_go)
                    trySendSMS(accumulated);

                    // 将工具执行日志包裹在 <think> 标签中，前端自动折叠
                    function wrapToolSections(text) {
                        if (!text || typeof text !== 'string') return text;
                        // 如果文本已包含 <think> 块，不再嵌套包裹（避免多层 think 导致渲染异常）
                        if (/<think>/i.test(text)) return text;
                        var markers = ['⚙️', '📦', '⏱', '── 第'];
                        var lastIdx = -1;
                        for (var mi = 0; mi < markers.length; mi++) {
                            var p = text.lastIndexOf(markers[mi]);
                            if (p > lastIdx) lastIdx = p;
                        }
                        if (lastIdx < 0) return text;
                        var nl = text.indexOf('\n', lastIdx);
                        var split = nl >= 0 ? nl + 1 : text.length;
                        var think = text.substring(0, split).trim();
                        var rest = text.substring(split).trim();
                        if (!think) return text;
                        return rest ? '<think>\n' + think + '\n</think>\n\n' + rest : '<think>\n' + think + '\n</think>';
                    }

                    // 回答完毕，复位思考块为折叠状态
                    localStorage.removeItem('think_expanded');
                    var finalText = (stripAnsi(accumulated).trim() || '执行完成 (无输出)') + ' Exit';
                    // 清理流式渲染状态（RAF + 包装器 + localStorage 节流定时器）
                    if (sessionState._streamRaf) { sessionState._streamRaf = false; }
                    if (sessionState._lsSaveTimer) { clearTimeout(sessionState._lsSaveTimer); sessionState._lsSaveTimer = null; }
                    if (replyEl) {
                        replyEl._streamWrapper = null; // 清理包装器引用
                        replyEl.innerHTML = renderMessageContent(wrapToolSections(accumulated), false, true);
                    }

                    // 添加操作按钮（日期、播放、引用、复制、分享、收藏、删除）
                    const doneTime = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
                    const doneDate = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
                    const doneFullTime = `${doneDate} ${doneTime}`;
                    const doneSafeContent = encodeURIComponent(finalText).replace(/'/g, '%27');
                    const doneBackendLabel = (sessionState.currentBackend || currentBackend) === 'hermes' ? 'Hermes' : (sessionState.currentBackend || currentBackend) === 'xcrab' ? 'xCrab' : 'OpenClaw';
                    const doneBackendBadge = sessionState.currentBackend || currentBackend;
                    const doneTimeRow = document.querySelector('#row-' + replyMsgId + ' .msg-time');
                    if (doneTimeRow) {
                        doneTimeRow.innerHTML = `<span class=\"backend-badge ${doneBackendBadge}\">${doneBackendLabel}</span>
                            <span class=\"msg-actions\">
                                <img id=\"play-btn-${replyMsgId}\" class=\"btn-action\" src=\"icon/play.png\" title=\"播放语音\" style=\"cursor:pointer; display:inline;\" onclick=\"handlePlayClick('${replyMsgId}', '${doneSafeContent}', this)\">
                                <i class=\"fa-solid fa-quote-left btn-action quote-btn\" title=\"引用\" onclick=\"quoteMessage('${replyMsgId}', '${doneSafeContent}', 'ai')\"></i>
                                <i class=\"fa-regular fa-copy btn-action\" title=\"复制\" onclick=\"copyText(this, '${doneSafeContent}')\"></i>
                                <i class=\"fa-solid fa-share btn-action\" title=\"分享\" onclick=\"shareMessage(this, '${doneSafeContent}')\"></i>
                                <i id=\"star-${replyMsgId}\" class=\"fa-regular fa-star btn-action\" title=\"收藏\" onclick=\"addFavorite(this, '${replyMsgId}', '${doneSafeContent}')\"></i>
                                <i class=\"fa-regular fa-trash-can btn-action\" title=\"删除\" onclick=\"deleteMessage('${replyMsgId}')\"></i>
                            </span>
                            <span style=\"margin-left:2px;\">${doneFullTime}</span>`;
                        // 恢复计时器（showExecutionTime 在前面已追加 exec-time，但被 innerHTML 覆盖）
                        const doneElapsed = sessionState.executionSeconds || 0;
                        if (doneElapsed > 0) {
                            const doneM = String(Math.floor(doneElapsed / 60)).padStart(2, '0');
                            const doneS = String(doneElapsed % 60).padStart(2, '0');
                            doneTimeRow.innerHTML += ` <span class=\"exec-time\">⏱ ${doneM}:${doneS}</span>`;
                        }
                    }

                    // 自动播放：触发播放按钮点击
                    if (ttsAutoPlayEnabled && finalText && replyEl) {
                        setTimeout(function() {
                            var playBtn = document.getElementById('play-btn-' + replyMsgId);
                            if (playBtn) playBtn.click();
                        }, 300);
                    }

                    // 更新本地历史
                    if (currentUser && sessionId) {
                        const key = 'wclaw_history_' + currentUser + '_' + sessionId;
                        try {
                            let history = JSON.parse(localStorage.getItem(key) || '[]');
                            const existingIdx = history.findIndex(m => m.id === replyMsgId);
                            if (existingIdx !== -1) {
                                // 如果已被手动停止，保留停止标记，不覆写
                                if (history[existingIdx].content && history[existingIdx].content.includes('[已手动停止]')) {
                                    history[existingIdx].executionSeconds = sessionState.executionSeconds;
                                } else {
                                    history[existingIdx].content = finalText;
                                    history[existingIdx].status = 'success';
                                    history[existingIdx].executionSeconds = sessionState.executionSeconds;
                                    history[existingIdx].backend = sessionState.currentBackend || currentBackend;
                                }
                                localStorage.setItem(key, JSON.stringify(history));
                            }
                        } catch(e) {}
                    }
                } else if (data.type === 'heartbeat') {
                    // 空闲心跳：显示距离上次收到 xCrab 数据的时间
                    // 如果会话已结束，忽略心跳避免覆盖 done 的清理
                    if (!sessionState.isExecuting) return;
                    var _statusBarH = document.getElementById('status-bar');
                    if (_statusBarH && data.idleSeconds) {
                        _statusBarH.style.display = 'flex';
                        var _statusTextH = _statusBarH.querySelector('.status-text');
                        if (_statusTextH) {
                            _statusTextH.innerHTML = '⏳ xCrab 思考中（无响应 ' + data.idleSeconds + 's）<span id="status-timer">...</span>';
                        }
                    }
                } else if (data.type === 'stall_warning') {
                    // 卡顿警告：在页面顶部显示黄色警告条
                    var _warnEl = document.getElementById('xcrab-stall-warning');
                    if (!_warnEl) {
                        _warnEl = document.createElement('div');
                        _warnEl.id = 'xcrab-stall-warning';
                        _warnEl.style.cssText = 'position:fixed;top:60px;left:0;right:0;z-index:1000;background:#fff3cd;color:#856404;text-align:center;padding:8px 16px;font-size:13px;border-bottom:1px solid #ffeeba;';
                        document.body.insertBefore(_warnEl, document.body.firstChild);
                    }
                    _warnEl.innerHTML = '⚠️ ' + escapeHtml(data.message || 'xCrab 可能卡顿');
                } else if (data.type === 'stall_resolved') {
                    // 卡顿恢复：移除警告，状态栏恢复正常
                    var _warnElR = document.getElementById('xcrab-stall-warning');
                    if (_warnElR) _warnElR.remove();
                    var _statusBarR = document.getElementById('status-bar');
                    if (_statusBarR) {
                        var _statusTextR = _statusBarR.querySelector('.status-text');
                        if (_statusTextR) {
                            _statusTextR.innerHTML = '正在执行任务... <span id="status-timer">00:00</span>';
                        }
                    }
                }
            } catch(e) {
                console.error('SSE消息解析失败:', e);
            }
        };

        // 在消息气泡中显示"连接断开，正在重连..."，同时保持原有内容
        function showReconnectingBubble(replyMsgId, attemptNum) {
            const el = document.getElementById(replyMsgId);
            if (!el) return;
            let qualityHint = '';
            if (attemptNum >= 10) {
                qualityHint = ' <span style="color:#e74c3c;">网络质量极差</span>';
            } else if (attemptNum >= 5) {
                qualityHint = ' <span style="color:#f39c12;">网络不稳定</span>';
            }
            // 如果已经有累计输出，在底部追加状态信息
            const existingContent = sessionState.accumulatedOutput;
            if (existingContent) {
                // 已有内容时，只在底部显示小提示
                let reconnectingHint = el.querySelector('.reconnecting-hint');
                if (!reconnectingHint) {
                    reconnectingHint = document.createElement('div');
                    reconnectingHint.className = 'reconnecting-hint';
                    reconnectingHint.style.cssText = 'margin-top:8px;padding:4px 8px;background:#fff3cd;border-radius:4px;font-size:12px;color:#856404;text-align:center;';
                    el.appendChild(reconnectingHint);
                }
                reconnectingHint.innerHTML = '🔄 连接断开，正在重连... (第' + attemptNum + '次)' + qualityHint;
            } else {
                // 无内容时直接替换
                el.innerHTML = '连接断开，正在重连中<span class="loading-dots"></span>' + qualityHint;
            }
        }

        sessionState.eventSource.onerror = function() {
            console.log(`[DEBUG SSE onerror] sessionId: ${sessionId}, msgId: ${sessionState.msgId}, reconnectAttempt: ${reconnectAttempt}, stoppedByUser: ${sessionState.stoppedByUser}, sseCompleted: ${sessionState.sseCompleted}, hasEventSource: ${!!sessionState.eventSource}, isExecuting: ${sessionState.isExecuting}`);
            if (sessionState.doneTimeout) {
                clearTimeout(sessionState.doneTimeout);
                sessionState.doneTimeout = null;
            }

            // 用户主动停止，不触发重连
            if (sessionState.stoppedByUser) {
                if (sessionState.eventSource) {
                    sessionState.eventSource.close();
                    sessionState.eventSource = null;
                }
                sessionState.stoppedByUser = false;
                return;
            }

            // SSE 已正常完成（收到 done），不触发重连
            if (sessionState.sseCompleted) {
                if (sessionState.eventSource) {
                    sessionState.eventSource.close();
                    sessionState.eventSource = null;
                }
                sessionState.sseCompleted = false;
                return;
            }

            if (sessionState.msgId) {
                // 有活跃消息：关闭旧连接，手动控制重连
                if (sessionState.eventSource) {
                    sessionState.eventSource.close();
                    sessionState.eventSource = null;
                }
                // ===== 无限重连（指数退避，上限 30 秒） =====
                const attemptNum = reconnectAttempt + 1;
                const delay = Math.min(SSE_RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempt), 30000);
                console.log(`会话 ${sessionId} SSE 连接断开，${delay}ms 后尝试第 ${attemptNum} 次重连`);

                // 在消息气泡中显示重连状态
                const replyMsgId = sessionState.msgId.startsWith('reply-') ? sessionState.msgId : 'reply-' + sessionState.msgId;
                showReconnectingBubble(replyMsgId, attemptNum);

                // 同时更新状态栏
                const statusBar = document.getElementById('status-bar');
                if (statusBar) {
                    statusBar.style.display = 'flex';
                    const statusText = statusBar.querySelector('.status-text');
                    if (statusText) {
                        let qualityHint = '';
                        if (attemptNum >= 10) {
                            qualityHint = ' <span style="color:#e74c3c;">（网络质量极差）</span>';
                        } else if (attemptNum >= 5) {
                            qualityHint = ' <span style="color:#f39c12;">（网络不稳定）</span>';
                        }
                        statusText.innerHTML = '🔄 连接断开，正在重连 <span id="status-timer">' + attemptNum + '次</span>' + qualityHint;
                    }
                }

                // 启动状态轮询：在重连期间定期检查服务端执行状态
                let pollIntervalId = null;
                if (attemptNum <= 3) {
                    // 前 3 次重连不轮询（等待短时恢复）
                } else {
                    // 第 4 次起开始轮询，检测执行端是否还在线
                    if (!sessionState._pollInterval) {
                        sessionState._pollInterval = setInterval(function() {
                            if (sessionState.sseCompleted || sessionState.stoppedByUser) {
                                clearInterval(sessionState._pollInterval);
                                sessionState._pollInterval = null;
                                return;
                            }
                            // 使用 fetch 检查会话执行状态
                            fetch(host + '/api/session_exec_status?sessionId=' + encodeURIComponent(sessionId), {
                                headers: { 'Authorization': 'Bearer ' + currentToken },
                                signal: AbortSignal.timeout(5000)
                            }).then(function(r) { return r.json(); }).then(function(resp) {
                                if (resp.code === 200 && resp.data) {
                                    // 如果 cclaw 已离线且不再执行，结束等待
                                    if (!resp.data.isExecuting && !resp.data.cclawOnline) {
                                        console.log('[SSE 轮询] cclaw 已离线且执行结束');
                                        clearInterval(sessionState._pollInterval);
                                        sessionState._pollInterval = null;
                                        // 不自动结束，让重连确认最终状态
                                    }
                                    // 更新状态栏显示
                                    var sBar = document.getElementById('status-bar');
                                    if (sBar) {
                                        var sText = sBar.querySelector('.status-text');
                                        if (sText && sText.innerHTML.indexOf('重连') !== -1) {
                                            var hint = '';
                                            if (!resp.data.cclawOnline) hint = '（执行端离线）';
                                            else if (resp.data.isExecuting) hint = '（任务执行中）';
                                            else if (resp.data.isStale) hint = '（任务可能卡死）';
                                            sText.innerHTML = '🔄 正在重连' + hint + ' <span id="status-timer">' + attemptNum + '次</span>';
                                        }
                                    }
                                }
                            }).catch(function() {});
                        }, 5000);
                    }
                }

                sessionState.reconnectTimer = setTimeout(function() {
                    // 清除轮询定时器（会在下一次重连时重新创建）
                    if (sessionState._pollInterval) {
                        clearInterval(sessionState._pollInterval);
                        sessionState._pollInterval = null;
                    }
                    // 不重置 accumulatedOutput，保留已收到的内容
                    startSSE(msgId, sessionId, reconnectAttempt + 1);
                }, delay);
            } else {
                // 没有 msgId（空闲状态断线），不弹横幅，让浏览器 EventSource 自动重连
                // EventSource 内置了指数退避重连机制
                if (reconnectAttempt === 0) {
                    console.log(`[SSE] 空闲连接断开，EventSource 将自动重连`);
                }
            }
        };
    }

    function addHistory(cmd, msgId, sessionId) {
        const box = document.getElementById('chat-box');
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        const safeCmd = encodeURIComponent(cmd).replace(/'/g, "%27");

        saveToLocalHistory({
            id: msgId,
            role: 'user',
            content: cmd,
            timestamp: Date.now()
        }, sessionId);
        
        // 用户消息
        box.insertAdjacentHTML('beforeend', `
            <div class="msg-row user" id="row-${msgId}" style="flex-direction: row; align-items: center; justify-content: flex-end; width: 100%;">
                <div class="msg-wrapper user">
                    <div class="msg-bubble">${escapeHtml(cmd)}</div>
                    <div class="msg-time">${fullTime}
                        <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${msgId}', '${safeCmd}', 'user')"></i>
                        <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeCmd}')"></i>
                        <i id="star-${msgId}" class="fa-regular fa-star btn-action" title="收藏" onclick="addFavorite(this, '${msgId}', '${safeCmd}')"></i>
                        <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${msgId}')"></i>
                    </div>
                </div>
                <input type="checkbox" class="batch-checkbox" value="${msgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
            </div>
        `);

        // AI 占位消息
        const replyMsgId = `reply-${msgId}`;
        const backendBadge = currentBackend === 'hermes' ? 'Hermes' : currentBackend === 'xcrab' ? 'xCrab' : 'OpenClaw';
        box.insertAdjacentHTML('beforeend', `
            <div class="msg-row ai" id="row-${replyMsgId}" style="flex-direction: row; align-items: center; justify-content: flex-start; width: 100%;">
                <input type="checkbox" class="batch-checkbox" value="${replyMsgId}" style="display:none; margin-right: 10px; width: 18px; height: 18px; cursor: pointer;" onchange="updateBatchCount()">
                <div class="msg-wrapper ai">
                    <div class="msg-bubble" id="${replyMsgId}">执行中<span class="loading-dots"></span></div>
                    <div class="msg-time" id="time-row-${replyMsgId}">
                        <span class="backend-badge ${currentBackend}">${backendBadge}</span>
                        <img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:none;">
                    </div>
                </div>
            </div>
        `);
        
        // 更新会话状态，使用传入的 sessionId
        const sessionState = getSessionState(sessionId);
        sessionState.msgId = replyMsgId;
        
        scrollToBottom();
    }

    function updateHistoryResult(msgId, resultData) {
        const replyMsgId = `reply-${msgId}`;
        const replyEl = document.getElementById(replyMsgId);
        const rowEl = document.getElementById(`row-${replyMsgId}`);
        if (!replyEl) return;
        
        let output = resultData.stdout || '';
        let error = resultData.stderr || '';
        
        output = stripAnsi(output);
        error = stripAnsi(error);

        let finalContent = '';
        let status = 'success';
        if (error) {
            rowEl.classList.add('error');
            finalContent = error;
            status = 'error';
        } else {
            // 检测 SMS 触发标记 (内容@手机号@SMS_go)
            trySendSMS(output);
            finalContent = (output.trim() || '执行完成 (无输出)') + ' Exit';
        }
        
        replyEl.innerHTML = renderMessageContent(finalContent, false, true);
        
        // 更新时间戳和操作按钮
        const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
        const fullTime = `${date} ${time}`;
        const safeContent = encodeURIComponent(finalContent).replace(/'/g, "%27");
        
        const existingTime = rowEl.querySelector('.msg-time');
        const backendLabel = currentBackend === 'hermes' ? 'Hermes' : currentBackend === 'xcrab' ? 'xCrab' : 'OpenClaw';
        const backendHtml = `<span class="backend-badge ${currentBackend}">${backendLabel}</span>`;
        if (existingTime) {
            existingTime.innerHTML = `${backendHtml}<img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:inline;" onclick="handlePlayClick('${replyMsgId}', '${safeContent}', this)">
                <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${replyMsgId}', '${safeContent}', 'ai')"></i>
                <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeContent}')"></i>
                <i class="fa-solid fa-share btn-action" title="分享" onclick="shareMessage(this, '${safeContent}')"></i>
                <i id="star-${replyMsgId}" class="fa-regular fa-star btn-action" title="收藏" onclick="addFavorite(this, '${replyMsgId}', '${safeContent}')"></i>
                <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${replyMsgId}')"></i>
                <span style="margin-left:2px;">${fullTime}</span>`;
        } else {
            replyEl.insertAdjacentHTML('afterend', `<div class="msg-time">${backendHtml}
                <img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:inline;" onclick="handlePlayClick('${replyMsgId}', '${safeContent}', this)">
                <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${replyMsgId}', '${safeContent}', 'ai')"></i>
                <i class="fa-regular fa-copy btn-action" title="复制" onclick="copyText(this, '${safeContent}')"></i>
                <i class="fa-solid fa-share btn-action" title="分享" onclick="shareMessage(this, '${safeContent}')"></i>
                <i id="star-${replyMsgId}" class="fa-regular fa-star btn-action" title="收藏" onclick="addFavorite(this, '${replyMsgId}', '${safeContent}')"></i>
                <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${replyMsgId}')"></i>
            </div>`);
        }

        saveToLocalHistory({
            id: replyMsgId,
            role: 'ai',
            content: finalContent,
            status: status,
            timestamp: Date.now(),
            backend: currentBackend
        });
        
        scrollToBottom();
        
        // 自动播放：触发播放按钮点击
        if (ttsAutoPlayEnabled && status === 'success' && finalContent) {
            setTimeout(function() {
                var playBtn = document.getElementById('play-btn-' + replyMsgId);
                if (playBtn) playBtn.click();
            }, 300);
        }

        // AI 回复提醒（震动+铃声），与自动播放独立
        if (status === 'success' && finalContent) {
            triggerNotify();
        }
    }

    function updateHistoryError(msgId, errorMsg) {
        const replyMsgId = msgId.startsWith('reply-') ? msgId : `reply-${msgId}`;
        const replyEl = document.getElementById(replyMsgId);
        const rowEl = document.getElementById(`row-${replyMsgId}`);
        if (replyEl) {
            rowEl.classList.add('error');
            
            // 如果原本是正常的，移除之前的样式并添加 error 样式
            rowEl.classList.remove('success');
            
            replyEl.innerText = errorMsg;
            
            const time = new Date().toLocaleTimeString('zh-CN', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
            const date = new Date().toLocaleDateString('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit'}).replace(/\//g, '-');
            const fullTime = `${date} ${time}`;
            const safeContent = encodeURIComponent(errorMsg).replace(/'/g, "%27");
            const existingTime = rowEl.querySelector('.msg-time');
            const errorBackendHtml = `<span class="backend-badge ${currentBackend}">${currentBackend === 'hermes' ? 'Hermes' : currentBackend === 'xcrab' ? 'xCrab' : 'OpenClaw'}</span>`;
            if (existingTime) {
                existingTime.innerHTML = `${errorBackendHtml}<img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:inline;" onclick="handlePlayClick('${replyMsgId}', '${safeContent}', this)">
                    <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${replyMsgId}', '${safeContent}', 'ai')"></i>
                    <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${replyMsgId}')"></i>
                    <span style="margin-left:2px;">${fullTime}</span>`;
            } else {
                replyEl.insertAdjacentHTML('afterend', `<div class="msg-time">${errorBackendHtml}${fullTime}
                    <img id="play-btn-${replyMsgId}" class="btn-action" src="icon/play.png" title="播放语音" style="cursor:pointer; display:inline;" onclick="handlePlayClick('${replyMsgId}', '${safeContent}', this)">
                    <i class="fa-solid fa-quote-left btn-action quote-btn" title="引用" onclick="quoteMessage('${replyMsgId}', '${safeContent}', 'ai')"></i>
                    <i class="fa-regular fa-trash-can btn-action" title="删除" onclick="deleteMessage('${replyMsgId}')"></i>
                </div>`);
            }

            saveToLocalHistory({
                id: replyMsgId,
                role: 'ai',
                content: errorMsg,
                status: 'error',
                timestamp: Date.now(),
                backend: currentBackend
            });
            
            scrollToBottom();
        }
    }

    function toggleHeaderActions(event) {
        event.stopPropagation();
        const actions = document.getElementById('header-actions');
        actions.classList.toggle('open');
    }

    document.addEventListener('click', function(event) {
        const actions = document.getElementById('header-actions');
        const btnMore = document.querySelector('.btn-more-actions');
        if (actions && actions.classList.contains('open')) {
            if (!actions.contains(event.target) && !btnMore.contains(event.target)) {
                actions.classList.remove('open');
            }
        }
    });

    // ===== 一键切换大模型 =====
    function closeSwitchModel() {
        document.getElementById('switch-model-modal').style.display = 'none';
    }

    async function executeSwitchModel(model) {
        closeSwitchModel();

        const modelName = model === 'deepseek' ? 'deepseek-v4-flash[1M]' : model === 'mimo' ? 'mimo-v2.5-pro[1M]' : 'MiniMax-M2.7';
        if (!confirm(`确定要切换至 ${modelName} 吗？\n\n切换过程中将:\n1. 更新本地配置\n2. 同步到云服务器\n3. 重启云服务器 ${currentBackend === 'xcrab' ? 'xCrab' : 'cclaw'} 服务\n\n请确认操作。`)) return;

        showAlert('info', `正在切换至 ${modelName}，请稍候...`);

        try {
            // xCrab 后端走 xCrab 的切换 API，否则走 cclaw 的
            const apiEndpoint = currentBackend === 'xcrab' ? '/api/xcrab/switch_model' : '/api/switch_model';
            const res = await fetch(host + apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ model }),
                signal: AbortSignal.timeout(30000)
            });
            const data = await res.json();

            if (data.code === 200) {
                showAlert('success', `✅ 已切换至 ${modelName}`);
                fetchCurrentModel();
                if (data.output) console.log(data.output);
            } else {
                showAlert('error', data.message || '切换失败');
                if (data.output) console.log(data.output);
            }
        } catch (e) {
            showAlert('error', '网络错误，切换失败');
        }
    }

    // ===== 移动端浮动输入框（置于页面顶部，避免键盘遮挡） =====
    var _mobileInputActive = false;

    function isMobile() {
        return window.innerWidth <= 768;
    }

    function showMobileInput() {
        if (_mobileInputActive) return;
        _mobileInputActive = true;

        const overlay = document.getElementById('mobile-input-overlay');
        const mobileInput = document.getElementById('mobile-command');
        const cmdInput = document.getElementById('command');
        if (!overlay || !mobileInput) { _mobileInputActive = false; return; }

        // 同步当前输入框的文本
        mobileInput.value = cmdInput ? cmdInput.value : '';
        overlay.style.display = 'flex';

        // 自动聚焦浮动输入框
        setTimeout(function() {
            mobileInput.focus();
            // 光标移到末尾
            if (mobileInput.value.length > 0) {
                mobileInput.setSelectionRange(mobileInput.value.length, mobileInput.value.length);
            }
        }, 300);
    }

    function closeMobileInput() {
        _mobileInputActive = false;
        const overlay = document.getElementById('mobile-input-overlay');
        if (!overlay) return;

        // 将浮动输入框的文本同步回原输入框
        const mobileInput = document.getElementById('mobile-command');
        const cmdInput = document.getElementById('command');
        if (mobileInput && cmdInput) {
            cmdInput.value = mobileInput.value;
            cmdInput.style.height = 'auto';
        }
        overlay.style.display = 'none';
    }

    async function sendMobileCommand() {
        _mobileInputActive = false;
        const overlay = document.getElementById('mobile-input-overlay');
        const mobileInput = document.getElementById('mobile-command');
        const cmdInput = document.getElementById('command');
        if (!mobileInput || !cmdInput) return;

        // 同步文本到原输入框
        cmdInput.value = mobileInput.value;
        cmdInput.style.height = 'auto';

        // 关闭浮动输入框
        overlay.style.display = 'none';

        // 调用发送
        await sendCommand();
    }

    // 初始化浮动输入框
    function initMobileInput() {
        var _initialized = false;
        if (_initialized) return;
        _initialized = true;

        const cmdInput = document.getElementById('command');
        if (!cmdInput) return;

        // 用 pointerdown 拦截点击（在 focus 之前触发），阻止原输入框获得焦点弹键盘
        cmdInput.addEventListener('pointerdown', function(e) {
            if (isMobile()) {
                e.preventDefault();
                e.target.blur();
                showMobileInput();
            }
        });

        // 移动端输入框文本同步 + 按键处理
        const mobileInput = document.getElementById('mobile-command');
        if (mobileInput) {
            mobileInput.addEventListener('input', function() {
                var target = document.getElementById('command');
                if (target) {
                    target.value = this.value;
                }
            });

            // 回车发送（Shift+Enter换行）
            mobileInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMobileCommand();
                }
            });
        }

        // 监听发送按钮状态，同步到浮动框的发送按钮
        var sendBtn = document.getElementById('send-btn');
        var mobileSendBtn = document.getElementById('mobile-send-btn');
        if (sendBtn && mobileSendBtn) {
            var sendObserver = new MutationObserver(function() {
                mobileSendBtn.disabled = sendBtn.disabled;
                if (sendBtn.style.display === 'none') {
                    mobileSendBtn.style.display = 'none';
                } else {
                    mobileSendBtn.style.display = '';
                }
            });
            sendObserver.observe(sendBtn, { attributes: true, attributeFilter: ['disabled', 'style'] });
        }

        // 监听停止按钮状态，同步到浮动框的停止按钮
        var stopBtn = document.getElementById('stop-btn');
        var mobileStopBtn = document.getElementById('mobile-stop-btn');
        if (stopBtn && mobileStopBtn) {
            var stopObserver = new MutationObserver(function() {
                mobileStopBtn.style.display = stopBtn.style.display;
            });
            stopObserver.observe(stopBtn, { attributes: true, attributeFilter: ['style'] });
        }
    }

    // DOM 加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileInput);
    } else {
        initMobileInput();
    }

