
    // ================= Android WebView 键盘适配 - 终极方案 =================
    (function() {
        // 保存原始高度
        var originalHeight = window.innerHeight;
        var isKeyboardVisible = false;
        
        // 方法1：监听 window resize
        function handleResize() {
            var currentHeight = window.innerHeight;
            var heightDiff = originalHeight - currentHeight;
            
            // 如果高度差超过150px，认为键盘弹起
            if (heightDiff > 150) {
                isKeyboardVisible = true;
                // 键盘弹起时，滚动到底部
                scrollToInput();
            } else if (isKeyboardVisible && heightDiff < 50) {
                isKeyboardVisible = false;
            }
        }
        
        function scrollToInput() {
            var input = document.getElementById('command');
            if (!input) {
                input = document.activeElement;
            }
            
            if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                // 确保输入框聚焦
                input.focus();
                
                // 延迟滚动，等待键盘完全弹出
                setTimeout(function() {
                    // 方法1：scrollIntoView
                    input.scrollIntoView({block: 'end', behavior: 'smooth'});
                    
                    // 方法2：如果上面没效果，手动滚动
                    setTimeout(function() {
                        var rect = input.getBoundingClientRect();
                        if (rect.bottom > window.innerHeight - 100) {
                            var chatBox = document.getElementById('chat-box');
                            if (chatBox) {
                                chatBox.scrollTop = chatBox.scrollHeight;
                            }
                        }
                    }, 200);
                }, 200);
            }
        }
        
        // 监听页面可见性变化，解决后台计时器暂停问题
        let _fetchTimer = null;
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                // 刷新当前模型信息（可能在其他标签页切换了模型）
                if (typeof fetchCurrentModel === 'function') {
                    if (_fetchTimer) clearTimeout(_fetchTimer);
                    _fetchTimer = setTimeout(fetchCurrentModel, 300);
                }
                // 页面重新可见时，立即更新所有活动会话的计时器显示
                if (currentSessionId && sessionExecutionStates[currentSessionId]) {
                    const sessionState = sessionExecutionStates[currentSessionId];
                    if (sessionState.executionTimer && sessionState.executionStartTime) {
                        // 立即更新计时器显示
                        const elapsed = Math.floor((Date.now() - sessionState.executionStartTime) / 1000);
                        sessionState.executionSeconds = elapsed;
                        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                        const s = String(elapsed % 60).padStart(2, '0');
                        document.getElementById('status-timer').innerText = `${m}:${s}`;
                    }
                }
            }
        });
        
        // 监听 resize
        window.addEventListener('resize', handleResize);
        
        // 方法2：监听 visualViewport（如果支持）
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', function() {
                if (isKeyboardVisible) {
                    scrollToInput();
                }
            });
        }
        
        // 方法3：监听输入框 focus 事件
        document.addEventListener('focusin', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                if (isKeyboardVisible) {
                    scrollToInput();
                }
            }
        });
        
        // 方法4：定时检查（如果键盘可见但输入框被遮挡）
        setInterval(function() {
            if (isKeyboardVisible) {
                var input = document.activeElement;
                if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA')) {
                    var rect = input.getBoundingClientRect();
                    if (rect.bottom > window.innerHeight - 50) {
                        scrollToInput();
                    }
                }
            }
        }, 500);
        
        // 页面加载完成后的初始化
        (function() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() { originalHeight = window.innerHeight; });
            } else {
                originalHeight = window.innerHeight;
            }
        })();
    })();

    // ================= 前端基础安全防护（防小白） =================
    // 1. 禁用鼠标右键菜单
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
    
    // 2. 禁用 F12, Ctrl+Shift+I (打开开发者工具), Ctrl+U (查看源码), Ctrl+S (保存网页)
    document.addEventListener('keydown', function(e) {
        if (
            e.keyCode === 123 || // F12
            (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || // Ctrl+Shift+I/J/C
            (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83)) // Ctrl+U, Ctrl+S
        ) {
            e.preventDefault();
        }
    });
    // ==========================================================
    var currentToken = localStorage.getItem('wclaw_token');
    var currentUser = localStorage.getItem('wclaw_user');
    var currentCanUseCloud = false; // 仅用于信息展示，不影响功能
    var savedUser = localStorage.getItem('wclaw_saved_user');
    var savedPwd = localStorage.getItem('wclaw_saved_pwd');
    var deviceToken = localStorage.getItem('wclaw_device_token');
    var lastTrustedUser = localStorage.getItem('wclaw_last_trusted_user');

    var host = window.location.origin;

    function isLocalStorageAvailable() {
        try {
            const test = '__storage_test__';
            localStorage.setItem(test, test);
            localStorage.removeItem(test);
            return true;
        } catch (e) {
            return false;
        }
    }
    var ttsAutoPlayEnabled = true; // 默认开启
    var notifyEnabled = true; // 默认开启

    if (isLocalStorageAvailable()) {
        ttsSettings = JSON.parse(localStorage.getItem('wclaw_tts_settings') || '{}');
        ttsAutoPlayEnabled = localStorage.getItem('wclaw_tts_autoplay') !== 'false';
        notifyEnabled = localStorage.getItem('wclaw_notify') !== 'false';
    }
    var currentAudio = null;
    var isPlaying = false;
    var currentPlayingMsgId = null;
    
    function getTTSSettings() {
        if (isLocalStorageAvailable()) {
            ttsSettings = JSON.parse(localStorage.getItem('wclaw_tts_settings') || '{}');
        }
        return ttsSettings;
    }
    
    function openTTSConfig() {
        const configUrl = 'edge-tts-config.html';
        window.open(configUrl, 'Edge TTS配置', 'width=700,height=800');
    }

    // 从服务端加载 TTS 配置并合并到 localStorage
    async function syncTTSSettingsFromServer() {
        if (!currentToken) return;
        try {
            const res = await fetch(host + '/api/tts_config', {
                headers: { 'Authorization': 'Bearer ' + currentToken },
                signal: AbortSignal.timeout(10000)
            });
            const data = await res.json();
            if (data.code === 200 && data.data && Object.keys(data.data).length > 0) {
                var local = JSON.parse(localStorage.getItem('wclaw_tts_settings') || '{}');
                // 服务端配置优先
                var merged = Object.assign({}, local, data.data);
                localStorage.setItem('wclaw_tts_settings', JSON.stringify(merged));
                ttsSettings = merged;
                console.log('TTS 配置已从服务端同步');
            }
        } catch (e) {
            console.log('从服务端同步 TTS 配置失败:', e.message);
        }
    }

    // 保存 TTS 配置到服务端
    async function saveTTSSettingsToServer(settings) {
        if (!currentToken) return;
        try {
            await fetch(host + '/api/tts_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + currentToken
                },
                body: JSON.stringify({ config: settings }),
                signal: AbortSignal.timeout(10000)
            });
        } catch (e) {
            console.log('TTS 配置同步到服务端失败:', e.message);
        }
    }
    
    async function playWithEdgeTTS(text, msgId) {
        const settings = getTTSSettings();
        
        console.log('TTS 设置:', settings);
        
        // 修复：如果没有 ttsType 字段，默认使用 edge
        if (!settings.enabled || !settings.apiUrl) {
            console.log('TTS 配置未启用或 API 地址为空');
            return false;
        }
        
        // 检查是否是 Edge TTS 或者 ttsType 未定义（旧配置兼容）
        if (settings.ttsType && settings.ttsType !== 'edge') {
            console.log('TTS 类型不是 edge');
            return false;
        }
        
        try {
            const cleanedText = stripAnsi(text).replace(/[#*_`~\[\]]/g, '').trim();
            if (!cleanedText) return true;
            
            const truncatedText = cleanedText.length > 500 ? cleanedText.substring(0, 500) : cleanedText;
            
            console.log('调用 Edge TTS API:', settings.apiUrl);
            
            // 检查协议是否匹配
            const isPageHTTPS = window.location.protocol === 'https:';
            const isAPIHTTPS = settings.apiUrl.startsWith('https://');
            
            if (isPageHTTPS && !isAPIHTTPS) {
                console.warn('⚠️ 混合内容警告：页面是 HTTPS 但 API 是 HTTP，可能被浏览器阻止');
            }
            
            const response = await fetch(`${settings.apiUrl}/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: truncatedText,
                    voice: settings.voice || 'zh-CN-XiaoxiaoNeural',
                    rate: settings.rate || '+0%'
                })
            });
            
            console.log('API 响应状态:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Edge TTS API 请求失败:', response.status, errorText);
                return false;
            }
            
            const audioBlob = await response.blob();
            console.log('音频 Blob 大小:', audioBlob.size, '类型:', audioBlob.type);
            
            if (audioBlob.size === 0) {
                console.error('音频 Blob 为空');
                return false;
            }
            
            const audioUrl = URL.createObjectURL(audioBlob);
            
            if (currentAudio) {
                currentAudio.pause();
                if (currentAudio.src) {
                    URL.revokeObjectURL(currentAudio.src);
                }
            }
            
            currentAudio = new Audio(audioUrl);
            currentAudio.preload = 'auto';
            
            // 修复手机浏览器兼容性问题
            // 1. 添加 playsinline 属性（防止 iOS 全屏）
            currentAudio.setAttribute('playsinline', 'true');
            currentAudio.setAttribute('webkit-playsinline', 'true');
            
            // 2. 添加更多调试信息
            currentAudio.onplay = () => {
                console.log('✅ 音频开始播放');
                isPlaying = true;
                updatePlayButtonState(msgId, true);
            };
            
            currentAudio.onplaying = () => {
                console.log('✅ 音频正在播放');
            };
            
            currentAudio.onended = () => {
                console.log('✅ 音频播放结束');
                isPlaying = false;
                currentPlayingMsgId = null;
                updatePlayButtonState(msgId, false);
                URL.revokeObjectURL(audioUrl);
            };
            
            currentAudio.onerror = (e) => {
                console.error('❌ 音频播放错误:', e);
                console.error('❌ 错误详情:', currentAudio.error);
                isPlaying = false;
                currentPlayingMsgId = null;
                updatePlayButtonState(msgId, false);
                URL.revokeObjectURL(audioUrl);
            };
            
            currentAudio.oncanplay = () => {
                console.log('✅ 音频已就绪，可以播放');
            };
            
            console.log('🎵 开始播放音频...');
            
            // 修复：使用 Promise 链式调用，更好地处理错误
            return currentAudio.play()
                .then(() => {
                    console.log('✅ 播放请求成功');
                    return true;
                })
                .catch(error => {
                    console.error('❌ 播放失败:', error);
                    // 检查是否是自动播放被阻止
                    if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
                        console.warn('⚠️ 浏览器阻止了自动播放，需要用户交互');
                    }
                    throw error;
                });
                
        } catch (e) {
            console.error('❌ Edge TTS 播放失败:', e);
            console.error('❌ 错误堆栈:', e.stack);
            return false;
        }
    }
    
    function updateTTSButton() {
        const btn = document.getElementById('btn-tts-autoplay');
        if (btn) {
            if (ttsAutoPlayEnabled) {
                btn.classList.remove('btn-icon-blue');
                btn.classList.add('btn-tts-active');
                btn.innerHTML = '<i class="fa-solid fa-volume-high"></i><span class="btn-text btn-text-grid"><span>自播</span><span>已开</span></span>';
            } else {
                btn.classList.remove('btn-tts-active');
                btn.classList.add('btn-icon-blue');
                btn.innerHTML = '<i class="fa-solid fa-volume-off"></i><span class="btn-text btn-text-grid"><span>自动</span><span>播放</span></span>';
            }
        }
    }

    function toggleTTSAutoPlay(btn) {
        ttsAutoPlayEnabled = !ttsAutoPlayEnabled;
        localStorage.setItem('wclaw_tts_autoplay', ttsAutoPlayEnabled);
        updateTTSButton();
    }

    function updateNotifyButton() {
        const btn = document.getElementById('btn-notify');
        if (btn) {
            if (notifyEnabled) {
                btn.classList.remove('btn-icon-blue');
                btn.classList.add('btn-tts-active');
                btn.innerHTML = '<i class="fa-solid fa-bell"></i><span class="btn-text btn-text-grid"><span>已开</span><span>提醒</span></span>';
            } else {
                btn.classList.remove('btn-tts-active');
                btn.classList.add('btn-icon-blue');
                btn.innerHTML = '<i class="fa-solid fa-bell-slash"></i><span class="btn-text btn-text-grid"><span>回复</span><span>提醒</span></span>';
            }
        }
    }

    function toggleNotify() {
        notifyEnabled = !notifyEnabled;
        localStorage.setItem('wclaw_notify', notifyEnabled);
        updateNotifyButton();
    }

    function triggerNotify() {
        if (!notifyEnabled) return;
        if (window.AndroidNotify) {
            try { window.AndroidNotify.vibrate(); } catch(e) {}
            try { window.AndroidNotify.playSound(); } catch(e) {}
        }
    }

    function stopAudio() {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        if (window.speechSynthesis) {
            try { speechSynthesis.cancel(); } catch(e) {}
        }
        isPlaying = false;
        currentPlayingMsgId = null;
    }

    function playTextAsSpeech(text, msgId) {
        if (!text || text.trim() === '') return;

        console.log('准备播放语音:', text.substring(0, 50) + '...');

        stopAudio();
        currentPlayingMsgId = msgId;

        const cleanedText = stripAnsi(text).replace(/[#*_`~\[\]]/g, '').trim();
        if (!cleanedText) return;

        const truncatedText = cleanedText.length > 500 ? cleanedText.substring(0, 500) + '...' : cleanedText;

        const settings = getTTSSettings();
        console.log('当前 TTS 配置:', settings);

        if (settings.enabled && settings.apiUrl && (!settings.ttsType || settings.ttsType === 'edge')) {
            console.log('使用 Edge TTS 播放');
            playWithEdgeTTS(cleanedText, msgId).then(success => {
                if (!success) {
                    console.error('Edge TTS 播放失败');
                    isPlaying = false;
                    currentPlayingMsgId = null;
                    updatePlayButtonState(msgId, false);
                }
            }).catch(e => {
                console.error('Edge TTS 异常:', e);
                isPlaying = false;
                currentPlayingMsgId = null;
                updatePlayButtonState(msgId, false);
            });
        } else {
            console.log('未配置 Edge TTS，尝试浏览器 TTS');
            playWithBrowserTTS(truncatedText, msgId);
        }
    }
    
    function playWithBrowserTTS(truncatedText, msgId) {
        // 检查 speechSynthesis 是否可用
        if (!window.speechSynthesis || typeof speechSynthesis === 'undefined') {
            console.error('浏览器不支持 speechSynthesis');
            alert('APP内置浏览器不支持语音合成，请点击右上角 ⋮ 按钮 → "TTS语音" 配置 Edge TTS 服务（APP 和电脑不共用设置）');
            isPlaying = false;
            currentPlayingMsgId = null;
            updatePlayButtonState(msgId, false);
            return;
        }

        try {
            const utterance = new SpeechSynthesisUtterance(truncatedText);
            utterance.lang = 'zh-CN';
            utterance.rate = 2.0;
            utterance.volume = 1;

            function initVoice() {
                try {
                    const voices = speechSynthesis.getVoices();
                    console.log('可用语音:', voices.map(v => `${v.name} (${v.lang})`));

                    let zhVoice = voices.find(v => v.lang.includes('zh-CN') && v.name.includes('Chinese'));
                    if (!zhVoice) zhVoice = voices.find(v => v.lang.includes('zh'));
                    if (!zhVoice) zhVoice = voices.find(v => v.name.toLowerCase().includes('zh'));
                    if (!zhVoice && voices.length > 0) zhVoice = voices[0];

                    if (zhVoice) {
                        utterance.voice = zhVoice;
                        console.log('使用语音:', zhVoice.name);
                    }

                    utterance.onend = function() {
                        isPlaying = false;
                        currentPlayingMsgId = null;
                        updatePlayButtonState(msgId, false);
                    };

                    utterance.onerror = function(e) {
                        console.error('语音播放错误:', e);
                        isPlaying = false;
                        currentPlayingMsgId = null;
                        updatePlayButtonState(msgId, false);
                    };

                    isPlaying = true;
                    updatePlayButtonState(msgId, true);
                    speechSynthesis.speak(utterance);
                } catch (e) {
                    console.error('initVoice 异常:', e);
                    isPlaying = false;
                    currentPlayingMsgId = null;
                    updatePlayButtonState(msgId, false);
                }
            }

            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) {
                console.log('语音列表为空，等待加载...');
                speechSynthesis.onvoiceschanged = function() {
                    speechSynthesis.onvoiceschanged = null;
                    initVoice();
                };
                setTimeout(function() {
                    if (speechSynthesis.getVoices().length === 0) {
                        initVoice();
                    }
                }, 1000);
            } else {
                initVoice();
            }
        } catch (e) {
            console.error('playWithBrowserTTS 异常:', e);
            isPlaying = false;
            currentPlayingMsgId = null;
            updatePlayButtonState(msgId, false);
        }
    }

    function updatePlayButtonState(msgId, playing) {
        const btn = document.getElementById(`play-btn-${msgId}`);
        if (btn) {
            btn.src = playing ? 'icon/stop.png' : 'icon/play.png';
            btn.title = playing ? '停止播放' : '播放语音';
        }
    }

    function handlePlayClick(msgId, text, btnElement) {
        console.log('点击播放按钮，msgId:', msgId);
        console.log('当前播放状态:', { isPlaying, hasCurrentAudio: currentAudio !== null, currentPlayingMsgId });

        // 如果正在播放同一个消息，停止播放
        if (isPlaying && currentPlayingMsgId === msgId) {
            console.log('停止当前播放');
            stopAudio();
            currentPlayingMsgId = null;
            updatePlayButtonState(msgId, false);
            return;
        }

        // 如果正在播放其他消息，先停止
        if (isPlaying) {
            console.log('停止当前播放并开始新的播放');
            const oldMsgId = currentPlayingMsgId;
            stopAudio();
            updatePlayButtonState(oldMsgId, false);
        }

        // 立即显示播放中状态（视觉反馈）
        isPlaying = true;
        currentPlayingMsgId = msgId;
        updatePlayButtonState(msgId, true);

        // 开始播放新消息
        console.log('开始新播放');
        // 播放时过滤掉思考过程 <think>...</think>
        var cleanText = decodeURIComponent(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        playTextAsSpeech(cleanText, msgId);
    }

    // 添加一个全局调试函数，方便在控制台测试
    window.testTTS = function() {
        console.log('=== TTS 调试信息 ===');
        console.log('localStorage 可用:', isLocalStorageAvailable());
        console.log('TTS 设置:', getTTSSettings());
        console.log('页面协议:', window.location.protocol);
        console.log('当前播放状态:', { isPlaying, hasCurrentAudio: currentAudio !== null });

        // 测试播放
        const testText = '你好，这是测试语音';
        const testMsgId = 'test-' + Date.now();
        console.log('测试播放文本:', testText);
        playTextAsSpeech(testText, testMsgId);
    };
    var currentTab = 'login';

    var currentEventSource = null;
    var currentMsgId = null;
    var sseReconnectAttempts = 0;
    var sseReconnectTimer = null;
    var heartbeatFailures = 0;
    var isReconnecting = false;
    var MAX_SSE_RECONNECT_ATTEMPTS = 5;
    var MAX_HEARTBEAT_FAILURES = 3;
    var HEARTBEAT_INTERVAL = 5000;
    var SSE_RECONNECT_BASE_DELAY = 1000;

    var executionTimer = null;
    var executionSeconds = 0;

    var currentSessionId = null;
    var sessions = [];
    var isSessionBatchMode = false;

    // 会话执行状态管理 - 为每个会话维护独立的执行状态
    var sessionExecutionStates = {};

    // 远程执行状态（按 sessionId 追踪）
    var remoteExecutingSessions = {}; // { sessionId: { since: timestamp } }

    // 为指定会话创建执行状态
    function getSessionState(sessionId) {
        if (!sessionExecutionStates[sessionId]) {
            sessionExecutionStates[sessionId] = {
                isExecuting: false,
                eventSource: null,
                msgId: null,
                reconnectAttempts: 0,
                reconnectTimer: null,
                _pollInterval: null,
                sseCompleted: false,
                stoppedByUser: false,
                processedResults: new Set(),
                executionTimer: null,
                executionSeconds: 0,
                executionStartTime: null,
                accumulatedOutput: '',
                streamSavedMsgId: null
            };
        }
        return sessionExecutionStates[sessionId];
    }

    // 清理指定会话的执行状态
    function cleanupSessionState(sessionId) {
        const state = sessionExecutionStates[sessionId];
        if (state) {
            if (state.eventSource) {
                state.eventSource.close();
                state.eventSource = null;
            }
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }
            if (state._pollInterval) {
                clearInterval(state._pollInterval);
                state._pollInterval = null;
            }
            state.msgId = null;
            state.reconnectAttempts = 0;
            state.sseCompleted = false;
            state.stoppedByUser = false;
            if (state.processedResults) state.processedResults.clear();
            if (state._idleCheckInterval) { clearInterval(state._idleCheckInterval); state._idleCheckInterval = null; }
        }
    }
    // 显示应用顶部横幅通知（非模态，不阻塞操作）
    function showNotice(message) {
        let noticeEl = document.getElementById('app-notice-banner');
        if (!noticeEl) {
            noticeEl = document.createElement('div');
            noticeEl.id = 'app-notice-banner';
            noticeEl.style.cssText = 'display:none; background:#FF9500; color:#fff; text-align:center; padding:8px 16px; font-size:13px; line-height:1.5; position:relative;';
            const appArea = document.getElementById('app-area');
            if (appArea) {
                appArea.insertBefore(noticeEl, appArea.firstChild);
            }
        }
        noticeEl.innerHTML = '<i class="fa-solid fa-info-circle"></i> ' + message;
        noticeEl.style.display = 'block';
    }

    function hideNotice() {
        const noticeEl = document.getElementById('app-notice-banner');
        if (noticeEl) {
            noticeEl.style.display = 'none';
        }
    }

    function showToast(type, message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.className = 'alert ' + type;
        toast.innerText = message;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3000);
    }

    function escapeHtml(unsafe) {
        return (unsafe||'').toString()
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }
    
    function stripAnsi(str) {
        if (!str) return '';
        // 移除所有 ANSI 转义序列：
        //   \x1B[...    CSI 序列（含私有模式如 \x1B[?25l）
        //   \x1B]...\x07 OSC 序列（操作系统命令，以 BEL 结尾）
        //   \x1B\\.      其他两字符序列（如 \x1B\\c）
        return str.replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '')
                  .replace(/\x1B\].*?\x07/g, '')
                  .replace(/\x1B\\[a-zA-Z]/g, '');
    }


    function showExecutionTime(msgId, sessionId) {
        const timeRow = document.getElementById(`time-row-reply-${msgId}`);
        if (!timeRow) return;
        // 避免重复添加（result 和 done 事件都会触发此函数）
        if (timeRow.querySelector('.exec-time')) return;
        const sessionState = getSessionState(sessionId);
        const elapsed = sessionState.executionSeconds || 0;
        if (elapsed <= 0) return;
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        timeRow.innerHTML += ` <span class="exec-time">⏱ ${m}:${s}</span>`;
    }
    
    // 自动补全未闭合的 <think> 块（流式输出时可能还没收到 </think>）
    function autoCloseThinkBlocks(text) {
        var openTags = (text.match(/<think>/gi) || []).length;
        var closeTags = (text.match(/<\/think>/gi) || []).length;
        if (openTags > closeTags) {
            for (var i = 0; i < openTags - closeTags; i++) text += '\n</think>';
        }
        return text;
    }

    // 代码块复制按钮
    function copyCodeBlock(btn) {
        var code = btn.getAttribute('data-code')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(function() {
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(function() { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
            });
        } else {
            var ta = document.createElement('textarea');
            ta.value = code; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); btn.innerHTML = '<i class="fa-solid fa-check"></i>'; setTimeout(function() { btn.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500); } catch(e) {}
            document.body.removeChild(ta);
        }
    }

    function renderMessageContent(content, skipExitTag = false, collapseLong = false) {
        try {
            const obj = JSON.parse(content);
            if (obj.type === 'image') {
                let html = `<img src="${host}${obj.url}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; display: block; cursor: pointer;" onclick="openImagePreview('${host}${obj.url.replace(/'/g, "\\'")}')" />`;
                if (obj.text) {
                    html += `<div style="margin-bottom: 8px;">${escapeHtml(obj.text)}</div>`;
                }
                html += `<a href="javascript:void(0)" onclick="downloadFile('${obj.url.replace(/'/g, "\\'")}', '${escapeHtml(obj.name)}')" style="color: inherit; text-decoration: underline; font-size: 13px;">下载图片 (${(obj.size/1024/1024).toFixed(2)}MB)</a>`;
                return html;
            } else if (obj.type === 'file') {
                let html = `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <i class="fa-solid fa-file-lines" style="font-size: 24px;"></i>
                            <span style="font-weight: 500;">${escapeHtml(obj.name)}</span>
                        </div>`;
                if (obj.text) {
                    html += `<div style="margin-bottom: 8px;">${escapeHtml(obj.text)}</div>`;
                }
                html += `<a href="javascript:void(0)" onclick="downloadFile('${obj.url.replace(/'/g, "\\'")}', '${escapeHtml(obj.name)}')" style="color: inherit; text-decoration: underline; font-size: 13px;">下载文件 (${(obj.size/1024/1024).toFixed(2)}MB)</a>`;
                return html;
            }
        } catch(e) {
        }

        // 处理带引用的文本消息（text_with_quote）
        try {
            const obj = JSON.parse(content);
            if (obj.type === 'text_with_quote') {
                const quoteLabel = obj.quoteRole === 'ai' ? '引用 AI' : obj.quoteRole === 'user' ? '引用自己' : '引用文本';
                const qContent = escapeHtml(obj.quote.substring(0, 100)) + (obj.quote.length > 100 ? '...' : '');
                const quoteHtml = `<div class="msg-quote"><div class="msg-quote-label">${quoteLabel}:</div><div class="msg-quote-content">${qContent}</div></div>`;
                return quoteHtml + escapeHtml(obj.text);
            }
        } catch(e) {}

        // 提前提取 Exit 标记（marked 转换 HTML 后再检测会失效）
        const hasExitText = !skipExitTag && content.length > 0 && content.endsWith(' Exit');
        if (hasExitText) {
            content = content.slice(0, -5);
        }

        // 当内容 >= 300 字符时，折叠前 1/3
        if (collapseLong && content.length >= 300) {
            const lines = content.split('\n');
            const totalLines = lines.length;
            let thirdIndex = Math.max(1, Math.floor(totalLines / 3));

            // 调整截断点，避免切断 markdown 表格
            thirdIndex = findTableSafeSplit(lines, thirdIndex);

            // 调整截断点，避免切断 think 块（<think>...</think>）
            thirdIndex = findThinkSafeSplit(lines, thirdIndex);

            if (thirdIndex < totalLines) {
                const firstPart = lines.slice(0, thirdIndex).join('\n');
                const secondPart = lines.slice(thirdIndex).join('\n');

                let firstHtml = renderTextPipeline(firstPart);
                let secondHtml = renderTextPipeline(secondPart);

                if (hasExitText) {
                    secondHtml += ' Exit';
                }

                return wrapCollapsible(firstHtml) + secondHtml;
            }
            // 找不到安全截断点（如整个都是表格）→ 走下方不折叠的逻辑
        }

        // 原始流程（不折叠）
        let safeContent = renderTextPipeline(content);

        if (hasExitText) {
            safeContent += ' Exit';
        }

        return safeContent;
    }

    function renderTextPipeline(text) {
        // 0. 自动补全未闭合的 <think> 块（流式输出时 </think> 可能还没到达）
        text = autoCloseThinkBlocks(text);

        // 0b. 保护 think 块（折叠思考过程）
        const thinkBlocks = [];
        text = text.replace(/<think>([\s\S]*?)<\/think>/g, (_match, content) => {
            const idx = thinkBlocks.length;
            // 统一换行符，再压缩连续空白行：3个以上连续换行缩为1个（不留空行）
            thinkBlocks.push(content.trim().replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n'));
            return `%%THINK_${idx}%%`;
        });
        // 0b. 捕获未闭合的 <think> 标签（没有 </think>），补全后仍按 think 块处理
        if (/<think>/i.test(text)) {
            text = text.replace(/<think>([\s\S]*)$/, (_match, content) => {
                const idx = thinkBlocks.length;
                thinkBlocks.push(content.trim().replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n'));
                return `%%THINK_${idx}%%`;
            });
        }

        // 1. 不允许连续两次换行：先统一换行符，再将2个以上连续换行替换为1个
        text = text.replace(/\r\n/g, '\n');
        text = text.replace(/\n{2,}/g, '\n');

        // 1. 移除 SEND_FILE 标记
        text = text.replace(/\[SEND_FILE:\s*[^\]]+\]/g, '');

        // 2. FILE_READY → 占位符（避免 marked 干扰）
        const fileReadyList = [];
        text = text.replace(/\[FILE_READY:\s*([^|]+)\|\s*([^\]]+)\]/g, (_match, url, name) => {
            const idx = fileReadyList.length;
            fileReadyList.push({ url: url.trim(), name: name.trim() });
            return `%%FILE_READY_${idx}%%`;
        });

        // 3. 保护行内代码中的管道符，防止被表格解析器误判为单元格分隔符
        const PIPE_HOLDER = '%%%PIPE%%%';
        text = text.replace(/(`+)(.+?)\1/g, (match, ticks, content) => {
            if (content.includes('|')) {
                return ticks + content.replace(/\|/g, PIPE_HOLDER) + ticks;
            }
            return match;
        });

        // 4. 修复无头表格（marked 不支持直接以分隔线开头的表格）
        text = fixHeaderlessTables(text);

        // 5. marked 解析 Markdown → HTML
        let html = renderMarkdownSafe(text);

        // 4. 代码高亮（marked 输出 <pre class="md-code"><code class="language-xx">）
        html = html.replace(/<pre class="md-code"><code class="language-([\w+#.+-]+)">([\s\S]*?)<\/code><\/pre>/g, (match, lang, code) => {
            const decoded = code.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            if (typeof hljs !== 'undefined' && hljs && hljs.getLanguage(lang)) {
                try {
                    const highlighted = hljs.highlight(decoded, { language: lang, ignoreIllegals: true }).value;
                    return `<pre class="md-code"><code>${highlighted}</code></pre>`;
                } catch(e) {}
            }
            return match;
        });
        html = html.replace(/<pre class="md-code"><code>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
            const decoded = code.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            if (typeof hljs !== 'undefined' && hljs) {
                try {
                    const highlighted = hljs.highlightAuto(decoded).value;
                    return `<pre class="md-code"><code>${highlighted}</code></pre>`;
                } catch(e) {}
            }
            return match;
        });

        // 5. 恢复 FILE_READY 占位符
        fileReadyList.forEach((item, idx) => {
            const htmlBlock = `<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px; padding: 10px; background: var(--input-bg); border-radius: 8px; border: 1px solid var(--border);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-file-arrow-down" style="font-size: 24px; color: var(--primary);"></i>
                        <span style="font-weight: 500; color: var(--text-main);">${escapeHtml(item.name)}</span>
                    </div>
                    <a href="javascript:void(0)" onclick="downloadFile('${item.url.replace(/'/g, "\\'")}', '${escapeHtml(item.name)}')" style="color: var(--primary); text-decoration: none; font-size: 14px; display: inline-flex; align-items: center; gap: 4px; font-weight: bold; cursor: pointer;">
                        <i class="fa-solid fa-download"></i> 点击下载文件
                    </a>
                </div>`;
            html = html.replace(`%%FILE_READY_${idx}%%`, htmlBlock);
        });

        // 6. 恢复 think 块占位符为可折叠 HTML（逆向遍历，确保嵌套 think 块从外到内恢复，避免 %%THINK_N%% 遗留为文本）
        const thinkExpanded = localStorage.getItem('think_expanded') === 'true';
        for (let idx = thinkBlocks.length - 1; idx >= 0; idx--) {
            const content = thinkBlocks[idx];
            const escaped = escapeHtml(content);
            const htmlBlock = `<details class="think-block"${thinkExpanded ? ' open' : ''} ontoggle="toggleThinkPref(event)">
                    <summary class="think-summary"><i class="fa-solid fa-chevron-right"></i> 思考过程</summary>
                    <div class="think-content">${escaped}</div>
                </details>`;
            html = html.replace(`%%THINK_${idx}%%`, htmlBlock);
        }
        // 扫尾：清理任何遗落的 think 占位符（如因嵌套仍残留的 %%THINK_0%%），替换为空字符串
        html = html.replace(/%%THINK_\d+%%/g, '');

        // 7. 恢复行内代码中被保护的管道符
        html = html.replace(new RegExp(PIPE_HOLDER.replace(/%/g, '\\%'), 'g'), '|');

        return html;
    }

    // 修复 marked 不支持的"无头表格"（直接以 |---|---| 分隔线开头）
    function fixHeaderlessTables(text) {
        return text.replace(/^(\|[\s\-:|]+\|)\s*$/gm, (match, sepLine, offset) => {
            const before = text.slice(0, offset).trim().split('\n').pop() || '';
            // 如果前一行已是表格行（有 | 且不是分隔线），说明 header 存在
            if (/^\|/.test(before) && !/^\|[\s\-:|]+\|$/.test(before)) {
                return match;
            }
            // 插入空 header 行
            const colCount = match.split('|').length - 2;
            if (colCount < 2) return match;
            return '|' + ' |'.repeat(colCount - 1) + ' |\n' + match;
        });
    }

    function wrapCollapsible(html) {
        return '<div class="msg-collapse">'
            + '<div class="msg-collapse-body collapsed">'
            + html
            + '</div>'
            + '<button class="msg-collapse-toggle" onclick="toggleCollapse(this)">展开前面内容 <i class="fa-solid fa-chevron-down"></i></button>'
            + '</div>';
    }
    function toggleCollapse(btn) {
        const container = btn.parentElement;
        const body = container.querySelector('.msg-collapse-body');
        const isExpanded = container.classList.toggle('expanded');
        body.classList.remove('collapsed');
        btn.innerHTML = isExpanded
            ? '收起 <i class="fa-solid fa-chevron-up"></i>'
            : '展开前面内容 <i class="fa-solid fa-chevron-down"></i>';
        if (!isExpanded) {
            body.classList.add('collapsed');
        }
    }

    function toggleThinkPref(event) {
        const details = event.target;
        localStorage.setItem('think_expanded', details.open);
    }

    // 通过下载接口直接跳转下载（触发 Android WebView DownloadListener / 兼容各端）
    function downloadFile(url, filename) {
        const fileParam = encodeURIComponent(url.split('/').pop());
        const nameParam = encodeURIComponent(filename);
        const downloadUrl = '/api/file/download?file=' + fileParam + '&name=' + nameParam;

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // 寻找安全的截断点，避免切断 markdown 表格
    function findTableSafeSplit(lines, targetIndex) {
        for (let i = targetIndex; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            // 空行 → 安全截断点
            if (trimmed === '') return i;

            // 以 | 开头 → 跳过整个表格块直到下一个空行
            // 中间行即使不以 | 开头也视为表格延续（如单元格换行）
            if (trimmed.startsWith('|')) {
                let j = i + 1;
                while (j < lines.length) {
                    if (lines[j].trim() === '') break;
                    j++;
                }
                i = j;
                if (i >= lines.length) return lines.length;
                continue;
            }

            // 非 | 非空行：检查是否在表格延续中（前面有 | 行）
            let isContinuation = false;
            for (let k = i - 1; k >= 0; k--) {
                if (lines[k].trim() === '') break;
                if (lines[k].trim().startsWith('|')) {
                    isContinuation = true;
                    break;
                }
            }
            if (isContinuation) continue;
            return i;
        }
        return lines.length;
    }

    // 寻找安全的截断点，避免切断 think 块（<think>...</think>）
    function findThinkSafeSplit(lines, targetIndex) {
        let inThink = false;
        let thinkBlockStart = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (!inThink && line.includes('<think>')) {
                inThink = true;
                thinkBlockStart = i;
            }

            if (inThink && line.includes('</think>')) {
                if (thinkBlockStart <= targetIndex && targetIndex <= i) {
                    return i + 1;
                }
                inThink = false;
            }
        }

        // 未闭合的 think 块，且目标点在块内 → 截断到最后
        if (inThink && thinkBlockStart <= targetIndex) {
            return lines.length;
        }

        return targetIndex;
    }

    // --- marked 自定义渲染器（安全加固 + 增强功能） ---
    var _safeProtocols = { 'http:': 1, 'https:': 1, 'mailto:': 1 };
    var _mdRenderer = new marked.Renderer();
    _mdRenderer.heading = function(t, l) { return '<h'+l+' class="md-h'+l+'">'+t+'</h'+l+'>'; };
    _mdRenderer.blockquote = function(t) { return '<blockquote class="md-blockquote">'+t+'</blockquote>'; };
    _mdRenderer.hr = function() { return '<hr class="md-hr">'; };
    _mdRenderer.code = function(code, lang) {
        var safeCode = escapeHtml(code);
        var lClass = lang && hljs && hljs.getLanguage(lang) ? ' class="language-'+lang+'"' : '';
        var labelHtml = lang ? '<span class="code-lang-label">'+escapeHtml(lang)+'</span>' : '';
        return '<pre class="md-code"><code'+lClass+'>'+safeCode+'</code>'+labelHtml+'<button class="code-copy-btn" data-code="'+safeCode.replace(/"/g, '&quot;').replace(/'/g, '&#39;')+'" onclick="copyCodeBlock(this)" title="复制代码"><i class="fa-regular fa-copy"></i></button></pre>';
    };
    _mdRenderer.codespan = function(t) { return '<code class="md-code-inline">'+t+'</code>'; };
    _mdRenderer.link = function(href, title, text) {
        try { if (!_safeProtocols[new URL(href, location.href).protocol]) href = 'javascript:void(0)'; } catch(e) {}
        var tAttr = title ? ' title="'+escapeHtml(title)+'"' : '';
        return '<a href="'+href+'"'+tAttr+' target="_blank" rel="noopener noreferrer">'+text+'</a>';
    };
    _mdRenderer.image = function(href, title, text) {
        var safeHref = escapeHtml(href||''), safeAlt = escapeHtml(text||'');
        return '<span class="img-preview-wrapper" onclick="openImagePreview(\''+safeHref.replace(/'/g,"\\'")+'\')"><img src="'+safeHref+'" alt="'+safeAlt+'" style="cursor:pointer;max-width:100%;border-radius:8px;margin:10px 0;display:block;">'+(text?'<span class="img-alt-hint">'+safeAlt+'</span>':'')+'</span>';
    };

    // 自动补全未闭合的代码块（流式输出时 ``` 可能还没收到结束标记）
    function autoCloseCodeBlocks(text) {
        var backtickCount = 0, tildeCount = 0;
        var fenceLang = '';
        var inFence = false;
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var trimmed = lines[i].trim();
            if (!inFence) {
                var btMatch = trimmed.match(/^(`{3,})(.*)/);
                var tlMatch = trimmed.match(/^(~{3,})(.*)/);
                if (btMatch) {
                    inFence = true; fenceLang = (btMatch[2]||'').trim();
                } else if (tlMatch) {
                    inFence = true; fenceLang = (tlMatch[2]||'').trim();
                }
            } else {
                if (/^`{3,}\s*$/.test(trimmed) || /^~{3,}\s*$/.test(trimmed)) {
                    inFence = false; fenceLang = '';
                }
            }
        }
        if (inFence) return text + '\n```';
        return text;
    }

    function renderMarkdownSafe(text) {
        // 自动补全未闭合的代码块
        text = autoCloseCodeBlocks(text);

        var html = marked.parse(text, {
            breaks: true, gfm: true, headerIds: false, mangle: false,
            renderer: _mdRenderer
        });

        // 对 marked 默认生成但自定义渲染器未覆盖的标签做后处理
        html = html.replace(/<(h[1-3])>(?!.*?class="md-)/g, '<$1 class="md-$1">');
        html = html.replace(/<blockquote(?![\s>]*class)/g, '<blockquote class="md-blockquote"');
        html = html.replace(/<hr\s*\/?>(?!.*?class)/g, '<hr class="md-hr">');

        // 表格：添加横向滚动容器
        html = html.replace(/<table>/g, '<div class="table-wrapper"><table>');
        html = html.replace(/<\/table>/g, '</table></div>');

        // 长单元格展开/折叠（纯文本超过15字符则截断并添加展开按钮）
        html = html.replace(/<td\b([^>]*)>([\s\S]*?)<\/td>/g, function(match, attrs, content) {
            var cleanText = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
            if (cleanText.length > 15) {
                var shortText = escapeHtml(cleanText.slice(0, 15));
                return '<td'+(attrs ? ' '+attrs : '')+' class="cell-limit"><span class="cell-preview">'+shortText+'</span><span class="cell-full" style="display:none">'+content+'</span> <button class="cell-toggle-btn" onclick="cellToggle(this)">展开 <i class="fa-solid fa-chevron-down"></i></button></td>';
            }
            return match;
        });

        // ___underline___（marked 不原生支持）
        html = html.replace(/___(.+?)___/g, '<u>$1</u>');

        return html;
    }

    function cellToggle(btn) {
        const td = btn.parentElement;
        const preview = td.querySelector('.cell-preview');
        const full = td.querySelector('.cell-full');
        const isExpanded = td.classList.toggle('expanded');
        if (isExpanded) {
            preview.style.display = 'none';
            full.style.display = '';
            btn.innerHTML = '收起 <i class="fa-solid fa-chevron-up"></i>';
        } else {
            preview.style.display = '';
            full.style.display = 'none';
            btn.innerHTML = '展开 <i class="fa-solid fa-chevron-down"></i>';
        }
    }

    // 图片预览放大
    function openImagePreview(src) {
        const overlay = document.getElementById('image-preview-overlay');
        const img = document.getElementById('image-preview-img');
        if (overlay && img) {
            img.src = src;
            overlay.style.display = 'flex';
        }
    }

    function closeImagePreview() {
        const overlay = document.getElementById('image-preview-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // 建立持久化通知 SSE 连接（独立于 AI 响应 SSE，用于接收系统推送通知）
    function connectNotificationSSE() {
        if (!currentToken) return;

        const url = host + '/api/notification_sse?token=' + encodeURIComponent(currentToken);
        var es = new EventSource(url);

        es.addEventListener('connected', function(e) {
            console.log('[通知SSE] 已连接');
        });

        es.addEventListener('notification', function(e) {
            try {
                var data = JSON.parse(e.data);
                if (data.message) {
                    showNotice(data.message);
                }
            } catch(err) {
                console.error('[通知SSE] 解析错误:', err);
            }
        });

        es.onerror = function() {
            // EventSource 会自动重连，不需要手动处理
        };
    }
