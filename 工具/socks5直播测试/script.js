document.addEventListener('DOMContentLoaded', function() {
    // ==================== 全局变量 ====================
    let isBatchTesting = false;
    let batchTestStopped = false;
    let batchTestResults = [];
    let testRecords = [];
    let currentTestLogs = []; // 当前测试的日志
    let historicalLogs = []; // 历史日志存储
    const MAX_RECORDS = 20;
    const MAX_HISTORICAL_LOGS = 10; // 最多保存10次测试日志
    const DISPLAY_RECORDS = 5;
    let isViewingHistoricalLog = false; // 是否正在查看历史日志
    
    // ==================== DOM元素获取 ====================
    const batchUrlsTextarea = document.getElementById('batch-urls');
    const batchTestBtn = document.getElementById('batch-test-btn');
    const stopBatchTestBtn = document.getElementById('stop-batch-test');
    const loadExampleUrlsBtn = document.getElementById('load-example-urls');
    const clearUrlsBtn = document.getElementById('clear-urls');
    const exportResultsBtn = document.getElementById('export-results-btn');
    const clearResultsBtn = document.getElementById('clear-results-btn');
    const clearLogBtn = document.getElementById('clear-log-btn');
    const exportLogBtn = document.getElementById('export-log-btn');
    const showRealtimeLogBtn = document.getElementById('show-realtime-log');
    const batchResultBody = document.getElementById('batch-result-body');
    const logBox = document.getElementById('log-box');
    const testLogCard = document.getElementById('test-log-card');
    
    const clearRecordsBtn = document.getElementById('clear-records-btn');
    const recordsList = document.getElementById('records-list');
    const recordsCount = document.getElementById('records-count');
    
    const historicalLogsSelect = document.getElementById('historical-logs');
    const loadHistoricalLogBtn = document.getElementById('load-historical-log');
    const clearHistoricalLogsBtn = document.getElementById('clear-historical-logs');
    
    const totalUrlsStat = document.getElementById('total-urls-stat');
    const completedUrlsStat = document.getElementById('completed-urls-stat');
    const successUrlsStat = document.getElementById('success-urls-stat');
    const failedUrlsStat = document.getElementById('failed-urls-stat');
    const validM3U8Stat = document.getElementById('valid-m3u8-stat');
    const successRateStat = document.getElementById('success-rate-stat');
    const urlCount = document.getElementById('url-count');
    
    const progressFill = document.getElementById('progress-fill');
    
    const useAuthCheckbox = document.getElementById('use-auth');
    const authFields = document.getElementById('auth-fields');
    const customUAInput = document.getElementById('custom-ua');
    const uaPresetSelect = document.getElementById('ua-preset');
    
    // ==================== 初始化 ====================
    authFields.style.display = 'none';
    initTestRecords();
    initHistoricalLogs();
    updateHistoricalLogsDropdown();
    
    // ==================== 代理身份验证显示控制 ====================
    useAuthCheckbox.addEventListener('change', function() {
        if (this.checked) {
            authFields.style.display = 'block';
        } else {
            authFields.style.display = 'none';
            document.getElementById('proxy-username').value = '';
            document.getElementById('proxy-password').value = '';
        }
    });
    
    // ==================== User-Agent 预设选择 ====================
    uaPresetSelect.addEventListener('change', function() {
        const selectedValue = this.value;
        if (selectedValue) {
            customUAInput.value = selectedValue;
            addLog(`已选择预置User-Agent: ${this.options[this.selectedIndex].text}`, 'info');
        }
    });
    
    // ==================== 批量测试功能 ====================
    function updateUrlCount() {
        const urls = getUrlsFromTextarea();
        const count = urls.length;
        urlCount.textContent = `URL数量: ${count}`;
        totalUrlsStat.textContent = count;
    }
    
    function getUrlsFromTextarea() {
        const text = batchUrlsTextarea.value.trim();
        if (!text) return [];
        return text.split('\n').map(url => url.trim()).filter(url => url.length > 0);
    }
    
    loadExampleUrlsBtn.addEventListener('click', function() {
        const exampleUrls = `http://tvgslb.hn.chinamobile.com:8089/180000001002/00000001000000000099000000193885/main.m3u8
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
http://playertest.longtailvideo.com/adaptive/bipbop/gear4/prog_index.m3u8
https://httpbin.org/status/200
https://httpbin.org/status/404
https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8`;
        batchUrlsTextarea.value = exampleUrls;
        updateUrlCount();
        addLog('已加载示例URL列表', 'success');
    });
    
    clearUrlsBtn.addEventListener('click', function() {
        batchUrlsTextarea.value = '';
        updateUrlCount();
        addLog('已清空URL列表', 'info');
    });
    
    clearResultsBtn.addEventListener('click', function() {
        batchResultBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #94a3b8;">
                    尚未开始批量测试，请配置URL并点击"开始批量测试"按钮
                </td></tr>`;
        totalUrlsStat.textContent = '0';
        completedUrlsStat.textContent = '0';
        successUrlsStat.textContent = '0';
        failedUrlsStat.textContent = '0';
        validM3U8Stat.textContent = '0';
        successRateStat.textContent = '0%';
        progressFill.style.width = '0%';
        batchTestResults = [];
        addLog('已清除批量测试结果', 'info');
    });
    
    clearLogBtn.addEventListener('click', function() {
        if (isViewingHistoricalLog) {
            addLog('正在查看历史日志，请先返回实时日志', 'warning');
            return;
        }
        logBox.innerHTML = '';
        addLog('当前测试日志已清除', 'info');
    });
    
    showRealtimeLogBtn.addEventListener('click', function() {
        showRealtimeLog();
    });
    
    batchUrlsTextarea.addEventListener('input', updateUrlCount);
    updateUrlCount();
    
    // ==================== 通用函数 ====================
    function formatUrlForDisplay(url, maxLength = 60) {
        if (!url) return '';
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    }
    
    function formatUrlForLog(url, maxLineLength = 80) {
        if (!url) return '';
        if (url.length <= maxLineLength) return url;
        
        const segments = [];
        let start = 0;
        
        while (start < url.length) {
            let end = start + maxLineLength;
            if (end >= url.length) {
                segments.push(url.substring(start));
                break;
            }
            
            const nextBreak = url.lastIndexOf('/', end);
            if (nextBreak > start + maxLineLength / 2) {
                end = nextBreak + 1;
            }
            
            segments.push(url.substring(start, end));
            start = end;
        }
        
        return segments.join('\n  ');
    }
    
    function showTestLogCard() {
        testLogCard.style.display = 'block';
        // 滚动到日志区域
        setTimeout(() => {
            testLogCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
    
    function hideTestLogCard() {
        testLogCard.style.display = 'none';
    }
    
    function addLog(message, type = 'info', details = null) {
        const now = new Date();
        const timeString = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
        
        // 创建日志对象
        const logEntry = {
            time: timeString,
            type: type,
            message: message,
            details: details,
            timestamp: now.getTime()
        };
        
        // 保存到当前测试日志
        if (!isViewingHistoricalLog) {
            currentTestLogs.push(logEntry);
        }
        
        // 如果正在查看历史日志，则不添加新的日志到显示
        if (isViewingHistoricalLog) {
            return;
        }
        
        // 创建DOM元素显示日志
        const logEntryElement = document.createElement('div');
        logEntryElement.className = 'log-entry';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'log-time';
        timeSpan.textContent = timeString;
        const messageSpan = document.createElement('span');
        messageSpan.className = `log-${type}`;
        
        // 处理消息中的URL，使其换行显示
        let formattedMessage = message;
        
        // 查找消息中的URL并格式化
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        formattedMessage = formattedMessage.replace(urlRegex, (url) => {
            return formatUrlForLog(url);
        });
        
        const statusCodeMatch = message.match(/(\d{3})/);
        if (statusCodeMatch && (message.includes('状态码') || message.includes('HTTP'))) {
            const statusCode = statusCodeMatch[1];
            formattedMessage = formattedMessage.replace(statusCode, `<span class="status-code status-${statusCode}">${statusCode}</span>`);
            messageSpan.innerHTML = formattedMessage;
        } else {
            messageSpan.textContent = formattedMessage;
        }
        
        logEntryElement.appendChild(timeSpan);
        logEntryElement.appendChild(messageSpan);
        
        // 添加详细信息（如果有）
        if (details) {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'connection-info';
            
            // 处理跳转链信息
            if (details.redirect_chain) {
                const redirectTitle = document.createElement('div');
                redirectTitle.style.color = '#94a3b8';
                redirectTitle.style.marginBottom = '8px';
                redirectTitle.style.fontWeight = 'bold';
                redirectTitle.textContent = '跳转链信息:';
                detailsDiv.appendChild(redirectTitle);
                
                details.redirect_chain.forEach((redirect, index) => {
                    const redirectDiv = document.createElement('div');
                    redirectDiv.style.marginBottom = '5px';
                    redirectDiv.style.paddingLeft = '15px';
                    redirectDiv.style.position = 'relative';
                    
                    // 添加序号
                    const indexSpan = document.createElement('span');
                    indexSpan.style.position = 'absolute';
                    indexSpan.style.left = '0';
                    indexSpan.style.color = '#4cc9f0';
                    indexSpan.textContent = `${index + 1}.`;
                    redirectDiv.appendChild(indexSpan);
                    
                    // 添加跳转信息
                    const infoSpan = document.createElement('span');
                    infoSpan.style.color = '#e0e0e0';
                    infoSpan.style.marginLeft = '20px';
                    infoSpan.style.fontFamily = "'Consolas', 'Monaco', monospace";
                    infoSpan.style.fontSize = '0.8rem';
                    infoSpan.innerHTML = `<span class="status-code status-${redirect.status}">${redirect.status}</span> → ${formatUrlForLog(redirect.url, 70)}`;
                    redirectDiv.appendChild(infoSpan);
                    
                    detailsDiv.appendChild(redirectDiv);
                });
            } else {
                // 普通详细信息
                for (const [key, value] of Object.entries(details)) {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'info-row';
                    const labelSpan = document.createElement('span');
                    labelSpan.className = 'info-label';
                    labelSpan.textContent = key + ':';
                    const valueSpan = document.createElement('span');
                    valueSpan.className = 'info-value';
                    valueSpan.textContent = value;
                    rowDiv.appendChild(labelSpan);
                    rowDiv.appendChild(valueSpan);
                    detailsDiv.appendChild(rowDiv);
                }
            }
            
            logEntryElement.appendChild(detailsDiv);
        }
        
        logBox.appendChild(logEntryElement);
        logBox.scrollTop = logBox.scrollHeight;
    }
    
    function exportLogs() {
        let logText = "SOCKS5代理直播源批量测试日志\n";
        logText += "生成时间: " + new Date().toLocaleString() + "\n";
        logText += "=".repeat(50) + "\n\n";
        
        // 导出当前显示的所有日志
        const logEntries = logBox.querySelectorAll('.log-entry');
        logEntries.forEach(entry => {
            const time = entry.querySelector('.log-time').textContent;
            const message = entry.querySelector('[class^="log-"]').textContent || '';
            logText += `${time} ${message}\n`;
            
            // 导出详细信息（包括跳转链）
            const detailsDiv = entry.querySelector('.connection-info');
            if (detailsDiv) {
                // 检查是否有跳转链
                const redirectItems = detailsDiv.querySelectorAll('div[style*="padding-left: 15px"]');
                if (redirectItems.length > 0) {
                    logText += "  跳转链信息:\n";
                    redirectItems.forEach(item => {
                        const text = item.textContent.replace(/\s+/g, ' ').trim();
                        logText += `    ${text}\n`;
                    });
                } else {
                    const rows = detailsDiv.querySelectorAll('.info-row');
                    rows.forEach(row => {
                        const label = row.querySelector('.info-label').textContent;
                        const value = row.querySelector('.info-value').textContent;
                        logText += `    ${label} ${value}\n`;
                    });
                }
            }
            logText += "\n";
        });
        
        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `socks5-batch-test-log-${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        addLog('日志已导出', 'success');
    }
    
    exportLogBtn.addEventListener('click', exportLogs);
    
    function updateProgress(percent) {
        progressFill.style.width = percent + '%';
    }
    
    // ==================== 历史日志管理 ====================
    function initHistoricalLogs() {
        const saved = localStorage.getItem('socks5_test_logs_history');
        if (saved) {
            try {
                historicalLogs = JSON.parse(saved);
            } catch (e) {
                historicalLogs = [];
            }
        }
    }
    
    function saveHistoricalLogs() {
        localStorage.setItem('socks5_test_logs_history', JSON.stringify(historicalLogs));
    }
    
    function saveCurrentTestLogs() {
        if (currentTestLogs.length === 0) return;
        
        const logEntry = {
            id: Date.now(),
            timestamp: new Date().toLocaleString(),
            logs: [...currentTestLogs],
            totalUrls: getUrlsFromTextarea().length,
            proxy: document.getElementById('proxy').value,
            successCount: batchTestResults.filter(r => r.success).length,
            totalCount: batchTestResults.length
        };
        
        historicalLogs.unshift(logEntry);
        
        // 限制历史日志数量
        if (historicalLogs.length > MAX_HISTORICAL_LOGS) {
            historicalLogs = historicalLogs.slice(0, MAX_HISTORICAL_LOGS);
        }
        
        saveHistoricalLogs();
        updateHistoricalLogsDropdown();
    }
    
    function updateHistoricalLogsDropdown() {
        historicalLogsSelect.innerHTML = '<option value="current">当前测试</option>';
        
        if (historicalLogs.length === 0) {
            return;
        }
        
        historicalLogs.forEach(log => {
            const option = document.createElement('option');
            option.value = log.id;
            const successRate = log.totalCount > 0 ? Math.round((log.successCount / log.totalCount) * 100) : 0;
            option.textContent = `${log.timestamp} - ${log.totalUrls}个URL - ${successRate}%成功`;
            option.title = `代理: ${log.proxy} | URL数量: ${log.totalUrls} | 成功率: ${successRate}%`;
            historicalLogsSelect.appendChild(option);
        });
    }
    
    loadHistoricalLogBtn.addEventListener('click', function() {
        const selectedId = historicalLogsSelect.value;
        if (selectedId === 'current') {
            showRealtimeLog();
            return;
        }
        
        const logEntry = historicalLogs.find(log => log.id.toString() === selectedId);
        if (!logEntry) {
            addLog('未找到选中的历史日志', 'error');
            return;
        }
        
        loadHistoricalLog(logEntry);
    });
    
    clearHistoricalLogsBtn.addEventListener('click', function() {
        if (confirm('确定要清除所有历史日志吗？此操作不可恢复。')) {
            historicalLogs = [];
            saveHistoricalLogs();
            updateHistoricalLogsDropdown();
            addLog('已清除所有历史日志', 'info');
        }
    });
    
    function loadHistoricalLog(logEntry) {
        // 清空当前显示
        logBox.innerHTML = '';
        
        // 设置正在查看历史日志标志
        isViewingHistoricalLog = true;
        
        // 更新标题显示
        const cardTitle = document.querySelector('#test-log-card .card-title');
        if (cardTitle) {
            const existingBadge = cardTitle.querySelector('.log-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            const badge = document.createElement('div');
            badge.style.display = 'inline-block';
            badge.style.marginLeft = '10px';
            badge.style.fontSize = '0.8rem';
            badge.style.background = 'rgba(245, 158, 11, 0.2)';
            badge.style.color = '#f59e0b';
            badge.style.padding = '2px 8px';
            badge.style.borderRadius = '12px';
            badge.textContent = `历史日志 - ${logEntry.timestamp}`;
            badge.className = 'log-badge';
            cardTitle.appendChild(badge);
        }
        
        // 加载历史日志条目
        logEntry.logs.forEach(log => {
            const logEntryElement = document.createElement('div');
            logEntryElement.className = 'log-entry';
            const timeSpan = document.createElement('span');
            timeSpan.className = 'log-time';
            timeSpan.textContent = log.time;
            const messageSpan = document.createElement('span');
            messageSpan.className = `log-${log.type}`;
            
            // 处理消息
            let formattedMessage = log.message;
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            formattedMessage = formattedMessage.replace(urlRegex, (url) => {
                return formatUrlForLog(url);
            });
            
            const statusCodeMatch = log.message.match(/(\d{3})/);
            if (statusCodeMatch && (log.message.includes('状态码') || log.message.includes('HTTP'))) {
                const statusCode = statusCodeMatch[1];
                formattedMessage = formattedMessage.replace(statusCode, `<span class="status-code status-${statusCode}">${statusCode}</span>`);
                messageSpan.innerHTML = formattedMessage;
            } else {
                messageSpan.textContent = formattedMessage;
            }
            
            logEntryElement.appendChild(timeSpan);
            logEntryElement.appendChild(messageSpan);
            
            // 添加详细信息（如果有）
            if (log.details) {
                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'connection-info';
                
                // 处理跳转链信息
                if (log.details.redirect_chain) {
                    const redirectTitle = document.createElement('div');
                    redirectTitle.style.color = '#94a3b8';
                    redirectTitle.style.marginBottom = '8px';
                    redirectTitle.style.fontWeight = 'bold';
                    redirectTitle.textContent = '跳转链信息:';
                    detailsDiv.appendChild(redirectTitle);
                    
                    log.details.redirect_chain.forEach((redirect, index) => {
                        const redirectDiv = document.createElement('div');
                        redirectDiv.style.marginBottom = '5px';
                        redirectDiv.style.paddingLeft = '15px';
                        redirectDiv.style.position = 'relative';
                        
                        // 添加序号
                        const indexSpan = document.createElement('span');
                        indexSpan.style.position = 'absolute';
                        indexSpan.style.left = '0';
                        indexSpan.style.color = '#4cc9f0';
                        indexSpan.textContent = `${index + 1}.`;
                        redirectDiv.appendChild(indexSpan);
                        
                        // 添加跳转信息
                        const infoSpan = document.createElement('span');
                        infoSpan.style.color = '#e0e0e0';
                        infoSpan.style.marginLeft = '20px';
                        infoSpan.style.fontFamily = "'Consolas', 'Monaco', monospace";
                        infoSpan.style.fontSize = '0.8rem';
                        infoSpan.innerHTML = `<span class="status-code status-${redirect.status}">${redirect.status}</span> → ${formatUrlForLog(redirect.url, 70)}`;
                        redirectDiv.appendChild(infoSpan);
                        
                        detailsDiv.appendChild(redirectDiv);
                    });
                } else {
                    // 普通详细信息
                    for (const [key, value] of Object.entries(log.details)) {
                        const rowDiv = document.createElement('div');
                        rowDiv.className = 'info-row';
                        const labelSpan = document.createElement('span');
                        labelSpan.className = 'info-label';
                        labelSpan.textContent = key + ':';
                        const valueSpan = document.createElement('span');
                        valueSpan.className = 'info-value';
                        valueSpan.textContent = value;
                        rowDiv.appendChild(labelSpan);
                        rowDiv.appendChild(valueSpan);
                        detailsDiv.appendChild(rowDiv);
                    }
                }
                
                logEntryElement.appendChild(detailsDiv);
            }
            
            logBox.appendChild(logEntryElement);
        });
        
        logBox.scrollTop = logBox.scrollHeight;
        addLog(`已加载历史测试日志 (${logEntry.timestamp})`, 'info', null, false);
    }
    
    function showRealtimeLog() {
        isViewingHistoricalLog = false;
        
        // 更新标题显示
        const cardTitle = document.querySelector('#test-log-card .card-title');
        if (cardTitle) {
            const existingBadge = cardTitle.querySelector('.log-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            const badge = document.createElement('div');
            badge.style.display = 'inline-block';
            badge.style.marginLeft = '10px';
            badge.style.fontSize = '0.8rem';
            badge.style.background = 'rgba(76, 201, 240, 0.2)';
            badge.style.color = '#4cc9f0';
            badge.style.padding = '2px 8px';
            badge.style.borderRadius = '12px';
            badge.textContent = '当前测试';
            badge.className = 'log-badge';
            cardTitle.appendChild(badge);
        }
        
        // 清空当前显示
        logBox.innerHTML = '';
        
        // 重新显示当前测试日志
        currentTestLogs.forEach(log => {
            const logEntryElement = document.createElement('div');
            logEntryElement.className = 'log-entry';
            const timeSpan = document.createElement('span');
            timeSpan.className = 'log-time';
            timeSpan.textContent = log.time;
            const messageSpan = document.createElement('span');
            messageSpan.className = `log-${log.type}`;
            
            // 处理消息
            let formattedMessage = log.message;
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            formattedMessage = formattedMessage.replace(urlRegex, (url) => {
                return formatUrlForLog(url);
            });
            
            const statusCodeMatch = log.message.match(/(\d{3})/);
            if (statusCodeMatch && (log.message.includes('状态码') || log.message.includes('HTTP'))) {
                const statusCode = statusCodeMatch[1];
                formattedMessage = formattedMessage.replace(statusCode, `<span class="status-code status-${statusCode}">${statusCode}</span>`);
                messageSpan.innerHTML = formattedMessage;
            } else {
                messageSpan.textContent = formattedMessage;
            }
            
            logEntryElement.appendChild(timeSpan);
            logEntryElement.appendChild(messageSpan);
            
            // 添加详细信息（如果有）
            if (log.details) {
                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'connection-info';
                
                // 处理跳转链信息
                if (log.details.redirect_chain) {
                    const redirectTitle = document.createElement('div');
                    redirectTitle.style.color = '#94a3b8';
                    redirectTitle.style.marginBottom = '8px';
                    redirectTitle.style.fontWeight = 'bold';
                    redirectTitle.textContent = '跳转链信息:';
                    detailsDiv.appendChild(redirectTitle);
                    
                    log.details.redirect_chain.forEach((redirect, index) => {
                        const redirectDiv = document.createElement('div');
                        redirectDiv.style.marginBottom = '5px';
                        redirectDiv.style.paddingLeft = '15px';
                        redirectDiv.style.position = 'relative';
                        
                        // 添加序号
                        const indexSpan = document.createElement('span');
                        indexSpan.style.position = 'absolute';
                        indexSpan.style.left = '0';
                        indexSpan.style.color = '#4cc9f0';
                        indexSpan.textContent = `${index + 1}.`;
                        redirectDiv.appendChild(indexSpan);
                        
                        // 添加跳转信息
                        const infoSpan = document.createElement('span');
                        infoSpan.style.color = '#e0e0e0';
                        infoSpan.style.marginLeft = '20px';
                        infoSpan.style.fontFamily = "'Consolas', 'Monaco', monospace";
                        infoSpan.style.fontSize = '0.8rem';
                        infoSpan.innerHTML = `<span class="status-code status-${redirect.status}">${redirect.status}</span> → ${formatUrlForLog(redirect.url, 70)}`;
                        redirectDiv.appendChild(infoSpan);
                        
                        detailsDiv.appendChild(redirectDiv);
                    });
                } else {
                    // 普通详细信息
                    for (const [key, value] of Object.entries(log.details)) {
                        const rowDiv = document.createElement('div');
                        rowDiv.className = 'info-row';
                        const labelSpan = document.createElement('span');
                        labelSpan.className = 'info-label';
                        labelSpan.textContent = key + ':';
                        const valueSpan = document.createElement('span');
                        valueSpan.className = 'info-value';
                        valueSpan.textContent = value;
                        rowDiv.appendChild(labelSpan);
                        rowDiv.appendChild(valueSpan);
                        detailsDiv.appendChild(rowDiv);
                    }
                }
                
                logEntryElement.appendChild(detailsDiv);
            }
            
            logBox.appendChild(logEntryElement);
        });
        
        logBox.scrollTop = logBox.scrollHeight;
        addLog('已返回实时测试日志', 'info');
    }
    
    // ==================== 测试记录功能 ====================
    function initTestRecords() {
        const saved = localStorage.getItem('socks5_test_records');
        if (saved) {
            try {
                testRecords = JSON.parse(saved);
            } catch (e) {
                testRecords = [];
            }
        }
        updateRecordsDisplay();
    }
    
    function saveRecordsToStorage() {
        localStorage.setItem('socks5_test_records', JSON.stringify(testRecords));
    }
    
    function updateRecordsDisplay() {
        recordsList.innerHTML = '';
        recordsCount.textContent = `记录: ${testRecords.length}/20`;
        
        if (testRecords.length === 0) {
            recordsList.innerHTML = `<div class="record-empty"><i class="fas fa-history"></i><p>暂无测试记录</p><p style="font-size: 0.8rem; margin-top: 5px;">完成测试后将自动保存记录</p></div>`;
            return;
        }
        
        // 按时间戳降序排序（最新的在前面）
        const sortedRecords = [...testRecords].sort((a, b) => b.timestamp - a.timestamp);
        
        sortedRecords.forEach((r, i) => {
            const item = document.createElement('div');
            item.className = 'record-compact';
            const time = new Date(r.timestamp).toLocaleString();
            const proxy = `${r.proxyHost}:${r.proxyPort}`;
            const firstUrl = r.firstUrl || '无URL';
            const urlCount = r.urlCount || 0;
            const successRate = r.testResults?.successRate || 0;
            
            let rateClass = 'low';
            if (successRate >= 80) rateClass = 'high';
            else if (successRate >= 50) rateClass = 'medium';
            
            item.innerHTML = `
                <div class="record-compact-header">
                    <div class="record-time">${time}</div>
                    <div class="record-proxy">${proxy}</div>
                </div>
                <div class="record-url" title="${firstUrl}">${firstUrl}</div>
                <div class="record-stats">
                    <div class="record-url-count">${urlCount} 个URL</div>
                    <div class="record-success-rate ${rateClass}">${successRate}% 成功</div>
                </div>
                <button class="record-delete-btn" data-timestamp="${r.timestamp}" title="删除">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            item.addEventListener('click', e => {
                if (!e.target.closest('.record-delete-btn')) {
                    // 找到原始记录索引（按时间排序前的索引）
                    const originalIndex = testRecords.findIndex(record => 
                        record.timestamp === r.timestamp && record.proxyHost === r.proxyHost
                    );
                    if (originalIndex !== -1) {
                        loadRecordToForm(testRecords[originalIndex], originalIndex);
                    }
                }
            });
            
            recordsList.appendChild(item);
        });
        
        // 删除按钮事件
        document.querySelectorAll('.record-delete-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const timestamp = parseInt(this.dataset.timestamp);
                if (confirm('确定删除这条记录吗？')) {
                    testRecords = testRecords.filter(record => record.timestamp !== timestamp);
                    saveRecordsToStorage();
                    updateRecordsDisplay();
                    addLog('已删除一条测试记录', 'info');
                }
            });
        });
    }
    
    function loadRecordToForm(r, originalIndex = -1) {
        document.getElementById('proxy').value = `${r.proxyHost}:${r.proxyPort}`;
        document.getElementById('custom-ua').value = r.customUA || '';
        document.getElementById('force-ipv4').checked = r.forceIPv4;
        document.getElementById('batch-urls').value = r.batchUrls || '';
        
        if (r.useAuth) {
            document.getElementById('use-auth').checked = true;
            document.getElementById('proxy-username').value = r.proxyUsername || '';
            document.getElementById('proxy-password').value = r.proxyPassword || '';
            authFields.style.display = 'block';
        } else {
            document.getElementById('use-auth').checked = false;
            authFields.style.display = 'none';
        }
        
        updateUrlCount();
        addLog(`已加载历史记录 (${new Date(r.timestamp).toLocaleString()})`, 'success');
        
        // 更新记录时间戳（标记为最新访问）
        if (originalIndex !== -1) {
            testRecords[originalIndex].timestamp = Date.now();
            // 重新排序
            testRecords.sort((a, b) => b.timestamp - a.timestamp);
            saveRecordsToStorage();
            updateRecordsDisplay();
        }
    }
    
    function generateRecordId(c) {
        return `${c.proxyHost}:${c.proxyPort}|${c.useAuth ? c.proxyUsername : ''}|${c.batchUrls.trim()}`;
    }
    
    function getCurrentConfig() {
        const proxyStr = document.getElementById('proxy').value.trim();
        const [proxyHost, proxyPort] = proxyStr.split(':');
        const useAuth = document.getElementById('use-auth').checked;
        const proxyUsername = document.getElementById('proxy-username').value.trim();
        const proxyPassword = document.getElementById('proxy-password').value.trim();
        const customUA = document.getElementById('custom-ua').value.trim();
        const forceIPv4 = document.getElementById('force-ipv4').checked;
        const batchUrls = document.getElementById('batch-urls').value.trim();
        const urls = batchUrls.split('\n').filter(u => u.trim().length > 0);
        const firstUrl = urls.length > 0 ? urls[0] : '';
        const urlCount = urls.length;
        const total = batchTestResults.length;
        const success = batchTestResults.filter(r => r.success).length;
        const failed = batchTestResults.filter(r => !r.success && !r.skipped).length;
        const validM3U8 = batchTestResults.filter(r => r.m3u8_valid).length;
        const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
        return {
            timestamp: Date.now(),
            proxyHost, 
            proxyPort: proxyPort || '1080',
            proxyUsername: useAuth ? proxyUsername : '',
            proxyPassword: useAuth ? proxyPassword : '',
            useAuth, 
            customUA, 
            forceIPv4, 
            batchUrls, 
            firstUrl, 
            urlCount,
            testResults: { total, success, failed, validM3U8, successRate }
        };
    }
    
    function autoSaveTestRecord() {
        const config = getCurrentConfig();
        const recordId = generateRecordId(config);
        const now = Date.now();
        
        // 查找是否已存在相同配置的记录
        const existingIndex = testRecords.findIndex(r => generateRecordId(r) === recordId);
        
        if (existingIndex !== -1) {
            // 更新已存在的记录：更新时间戳并移到最前面
            testRecords[existingIndex] = {
                ...config,
                timestamp: now // 更新为当前时间
            };
            
            // 将更新后的记录移到数组开头
            const updatedRecord = testRecords.splice(existingIndex, 1)[0];
            testRecords.unshift(updatedRecord);
            
            addLog('测试记录已更新并置顶', 'info');
        } else {
            // 添加新记录
            config.timestamp = now;
            testRecords.unshift(config);
            
            if (testRecords.length > MAX_RECORDS) {
                testRecords = testRecords.slice(0, MAX_RECORDS);
                addLog(`已达到最大记录数(${MAX_RECORDS})，已删除最旧的记录`, 'info');
            }
            addLog('测试记录已自动保存', 'success');
        }
        
        // 按时间戳降序排序（确保最新的在前面）
        testRecords.sort((a, b) => b.timestamp - a.timestamp);
        
        saveRecordsToStorage();
        updateRecordsDisplay();
    }
    
    clearRecordsBtn.addEventListener('click', function() {
        if (confirm('确定要清除所有测试记录吗？')) {
            testRecords = [];
            saveRecordsToStorage();
            updateRecordsDisplay();
            addLog('所有测试记录已清除', 'info');
        }
    });
    
    // ==================== 批量测试主流程 ====================
    batchTestBtn.addEventListener('click', performBatchTest);
    stopBatchTestBtn.addEventListener('click', function() {
        batchTestStopped = true;
        addLog('用户手动停止测试', 'warning');
    });
    
async function performBatchTest() {
        if (isBatchTesting) return;
        isBatchTesting = true;
        batchTestStopped = false;
        batchTestResults = [];
        currentTestLogs = []; // 清空当前测试日志
        
        // 确保回到实时日志模式
        if (isViewingHistoricalLog) {
            showRealtimeLog();
        }
        
        // 清除旧的日志内容
        logBox.innerHTML = '';
        addLog('开始批量测试...', 'info');
        
        // 显示测试日志卡片
        showTestLogCard();
        
        batchTestBtn.style.display = 'none';
        stopBatchTestBtn.style.display = 'block';
        
        const proxyStr = document.getElementById('proxy').value.trim();
        if (!proxyStr) {
            addLog('代理地址不能为空', 'error');
            isBatchTesting = false;
            batchTestBtn.style.display = 'block';
            stopBatchTestBtn.style.display = 'none';
            return;
        }
        let [proxyHost, proxyPort] = proxyStr.split(':');
        if (!proxyPort) proxyPort = '1080';
        if (!proxyHost || isNaN(proxyPort)) {
            addLog('代理地址格式错误，请输入如 127.0.0.1:1080', 'error');
            isBatchTesting = false;
            batchTestBtn.style.display = 'block';
            stopBatchTestBtn.style.display = 'none';
            return;
        }
        
        const urls = getUrlsFromTextarea();
        if (urls.length === 0) {
            addLog('URL列表为空，请先填写要测试的直播源', 'error');
            isBatchTesting = false;
            batchTestBtn.style.display = 'block';
            stopBatchTestBtn.style.display = 'none';
            return;
        }
        
        const proxyUsername = document.getElementById('proxy-username').value.trim();
        const proxyPassword = document.getElementById('proxy-password').value.trim();
        const useAuth = document.getElementById('use-auth').checked;
        const customUA = document.getElementById('custom-ua').value.trim();
        const forceIPv4 = document.getElementById('force-ipv4').checked;
        const testProxyFirst = document.getElementById('test-proxy-first').checked;
        const stopOnFirstFailure = document.getElementById('stop-on-first-failure').checked;
        const testOnlyM3U8 = document.getElementById('test-only-m3u8').checked;
        
        addLog(`开始批量测试，共 ${urls.length} 个URL`, 'info');
        
        if (testProxyFirst) {
            addLog('正在测试代理连通性...', 'info');
            try {
                const proxyResult = await fetch('api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        test_type: 'test_proxy',
                        proxy_host: proxyHost,
                        proxy_port: proxyPort,
                        proxy_username: useAuth ? proxyUsername : '',
                        proxy_password: useAuth ? proxyPassword : ''
                    })
                }).then(r => r.json());
                
                if (!proxyResult.success) {
                    addLog(`代理连接失败: ${proxyResult.error}`, 'error');
                    isBatchTesting = false;
                    batchTestBtn.style.display = 'block';
                    stopBatchTestBtn.style.display = 'none';
                    return;
                }
                addLog('代理连通性测试通过，开始批量测试URL...', 'success');
            } catch (e) {
                addLog(`代理测试失败: ${e.message}`, 'error');
                isBatchTesting = false;
                batchTestBtn.style.display = 'block';
                stopBatchTestBtn.style.display = 'none';
                return;
            }
        }
        
        for (let i = 0; i < urls.length; i++) {
            if (batchTestStopped) {
                addLog('测试已停止', 'warning');
                break;
            }
            
            const url = urls[i];
            const urlNumber = i + 1;
            
            // 更新进度条
            updateProgress((urlNumber / urls.length) * 100);
            
            if (testOnlyM3U8 && !url.toLowerCase().includes('.m3u8')) {
                addLog(`跳过非M3U8文件: ${url}`, 'info');
                const result = { 
                    url, 
                    success: false, 
                    status_code: 0, 
                    response_time: 0, 
                    is_m3u8: false, 
                    m3u8_valid: false, 
                    skipped: true, 
                    error: '跳过非M3U8文件' 
                };
                batchTestResults.push(result);
                addResultToTable(result, urlNumber);
                updateStats();
                continue;
            }
            
            const params = {
                urls: url,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                user_agent: customUA,
                force_ipv4: forceIPv4
            };
            if (useAuth && proxyUsername) {
                params.proxy_username = proxyUsername;
                params.proxy_password = proxyPassword;
            }
            
            try {
                const response = await fetch('api.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        test_type: 'batch_test_m3u8_via_proxy',
                        ...params
                    })
                });
                
                if (!response.ok) throw new Error(`HTTP错误: ${response.status}`);
                const data = await response.json();
                
                if (data.success && data.results && data.results.length > 0) {
                    const result = data.results[0];
                    result.url = url;
                    batchTestResults.push(result);
                    addResultToTable(result, urlNumber);
                    
                    if (result.success) {
                        addLog(`URL ${urlNumber}/${urls.length}: ${url} - 成功 (状态码: ${result.status_code})`, 'success');
                        
                        // 显示跳转链信息（如果有）
                        if (result.redirect_chain && result.redirect_chain.length > 0) {
                            addLog(`  → 跳转链信息:`, 'info', { redirect_chain: result.redirect_chain });
                        }
                        
                        if (result.is_m3u8 && result.m3u8_valid) {
                            addLog(`  → 有效M3U8，时长: ${result.m3u8_info?.duration || 0}秒，分段: ${result.m3u8_info?.ts_segments || 0}个`, 'success');
                        } else if (result.is_m3u8 && !result.m3u8_valid) {
                            addLog(`  → 无效M3U8文件`, 'warning');
                        }
                    } else {
                        addLog(`URL ${urlNumber}/${urls.length}: ${url} - 失败: ${result.error || '未知错误'}`, 'error');
                        if (stopOnFirstFailure && result.error && (result.error.includes('代理') || result.error.includes('Empty reply from server'))) {
                            addLog('遇到代理连接失败，停止测试', 'error');
                            batchTestStopped = true;
                        }
                    }
                } else {
                    const errorResult = { 
                        url, 
                        success: false, 
                        status_code: 0, 
                        response_time: 0, 
                        is_m3u8: false, 
                        m3u8_valid: false, 
                        error: data.error || 'API调用失败' 
                    };
                    batchTestResults.push(errorResult);
                    addResultToTable(errorResult, urlNumber);
                    addLog(`URL ${urlNumber}/${urls.length}: ${url} - API调用失败: ${data.error}`, 'error');
                }
            } catch (error) {
                const errorResult = { 
                    url, 
                    success: false, 
                    status_code: 0, 
                    response_time: 0, 
                    is_m3u8: false, 
                    m3u8_valid: false, 
                    error: error.message 
                };
                batchTestResults.push(errorResult);
                addResultToTable(errorResult, urlNumber);
                addLog(`URL ${urlNumber}/${urls.length}: ${url} - 网络错误: ${error.message}`, 'error');
            }
            
            updateStats();
        }
        
        isBatchTesting = false;
        batchTestBtn.style.display = 'block';
        stopBatchTestBtn.style.display = 'none';
        updateProgress(100);
        
        const total = batchTestResults.length;
        const success = batchTestResults.filter(r => r.success).length;
        const failed = total - success;
        const validM3U8 = batchTestResults.filter(r => r.m3u8_valid).length;
        const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
        
        addLog(`批量测试完成！总计: ${total}，成功: ${success}，失败: ${failed}，有效M3U8: ${validM3U8}，成功率: ${successRate}%`, 'success');
        
        // 保存当前测试日志到历史
        saveCurrentTestLogs();
        
        autoSaveTestRecord();
    }
    
    function addResultToTable(result, index) {
        if (batchResultBody.querySelector('td[colspan="7"]')) {
            batchResultBody.innerHTML = '';
        }
        
        const row = document.createElement('tr');
        
        let statusCodeClass = '';
        if (result.status_code === 200) statusCodeClass = 'status-200';
        else if (result.status_code >= 400 && result.status_code < 500) statusCodeClass = 'status-404';
        else if (result.status_code >= 500) statusCodeClass = 'status-500';
        else if (result.status_code >= 300 && result.status_code < 400) statusCodeClass = 'status-302';
        
        let m3u8Status = '', m3u8Class = '';
        if (result.skipped) { 
            m3u8Status = '跳过'; 
            m3u8Class = 'status-warning-badge'; 
        }
        else if (result.is_m3u8) { 
            m3u8Status = '是'; 
            m3u8Class = 'm3u8-badge'; 
        }
        else { 
            m3u8Status = '否'; 
            m3u8Class = 'status-neutral'; 
        }
        
        let m3u8ValidStatus = '', m3u8ValidClass = '';
        if (result.skipped) { 
            m3u8ValidStatus = '-'; 
            m3u8ValidClass = 'status-neutral'; 
        }
        else if (result.m3u8_valid) { 
            m3u8ValidStatus = '有效'; 
            m3u8ValidClass = 'valid-badge'; 
        }
        else if (result.is_m3u8) { 
            m3u8ValidStatus = '无效'; 
            m3u8ValidClass = 'invalid-badge'; 
        }
        else { 
            m3u8ValidStatus = '-'; 
            m3u8ValidClass = 'status-neutral'; 
        }
        
        // 优化详细信息显示：只显示分段数和时长
        let details = '';
        if (result.skipped) {
            details = result.error || '跳过';
        } else if (result.success) {
            if (result.is_m3u8 && result.m3u8_info) {
                const info = result.m3u8_info;
                // 只显示分段数和总时长
                if (info.ts_segments) {
                    details = `分段: ${info.ts_segments}`;
                }
                if (info.duration && info.duration > 0) {
                    const minutes = Math.floor(info.duration / 60);
                    const seconds = Math.floor(info.duration % 60);
                    if (minutes > 0) {
                        details += ` | 时长: ${minutes}分${seconds}秒`;
                    } else {
                        details += ` | 时长: ${seconds}秒`;
                    }
                }
            } else {
                details = `成功 - ${result.response_time}ms`;
            }
        } else {
            details = result.error || '未知错误';
        }
        
        // 如果有跳转链，在详细信息中添加提示
        if (result.redirect_chain && result.redirect_chain.length > 0) {
            details += ` (有${result.redirect_chain.length}次跳转)`;
        }
        
        // 确保URL显示为一行，超出部分用省略号，并添加title属性用于悬停提示
        const displayUrl = result.url;
        
        row.innerHTML = `
            <td>${index}</td>
            <td class="url-cell" title="${result.url}">${displayUrl}</td>
            <td><span class="status-code ${statusCodeClass}">${result.status_code || '-'}</span></td>
            <td>${result.response_time || 0}ms</td>
            <td><span class="status-badge ${m3u8Class}">${m3u8Status}</span></td>
            <td><span class="status-badge ${m3u8ValidClass}">${m3u8ValidStatus}</span></td>
            <td class="details-cell" title="${details}">${details}</td>
        `;
        batchResultBody.appendChild(row);
        batchResultBody.parentNode.parentNode.scrollTop = batchResultBody.parentNode.parentNode.scrollHeight;
    }
    
    function updateStats() {
        const total = batchTestResults.length;
        const completed = total;
        const success = batchTestResults.filter(r => r.success).length;
        const failed = batchTestResults.filter(r => !r.success && !r.skipped).length;
        const validM3U8 = batchTestResults.filter(r => r.m3u8_valid).length;
        const successRate = total > 0 ? Math.round((success / total) * 100) : 0;
        
        completedUrlsStat.textContent = completed;
        successUrlsStat.textContent = success;
        failedUrlsStat.textContent = failed;
        validM3U8Stat.textContent = validM3U8;
        successRateStat.textContent = `${successRate}%`;
    }
    
    exportResultsBtn.addEventListener('click', function() {
        if (batchTestResults.length === 0) {
            alert('没有测试结果可导出！');
            return;
        }
        
        let csvContent = "序号,URL,状态码,响应时间(ms),是否为M3U8,M3U8有效性,详细信息,跳转链\n";
        batchTestResults.forEach((result, index) => {
            // 构建跳转链信息
            let redirectsInfo = '';
            if (result.redirect_chain && result.redirect_chain.length > 0) {
                redirectsInfo = result.redirect_chain.map((r, i) => 
                    `${i+1}. ${r.status} -> ${r.url}`
                ).join('; ');
            }
            
            const row = [
                index + 1,
                `"${result.url}"`,
                result.status_code || '0',
                result.response_time || '0',
                result.is_m3u8 ? '是' : '否',
                result.m3u8_valid ? '有效' : (result.is_m3u8 ? '无效' : '-'),
                `"${result.error || (result.success ? '成功' : '失败')}"`,
                `"${redirectsInfo}"`
            ];
            csvContent += row.join(',') + "\n";
        });
        
        const total = batchTestResults.length;
        const success = batchTestResults.filter(r => r.success).length;
        const validM3U8 = batchTestResults.filter(r => r.m3u8_valid).length;
        const successRate = total > 0 ? ((success / total) * 100).toFixed(2) : 0;
        
        csvContent += `\n统计信息\n`;
        csvContent += `总URL数,${total}\n`;
        csvContent += `成功数,${success}\n`;
        csvContent += `失败数,${total - success}\n`;
        csvContent += `有效M3U8数,${validM3U8}\n`;
        csvContent += `成功率,${successRate}%\n`;
        csvContent += `生成时间,${new Date().toLocaleString()}\n`;
        
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch-test-results-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        addLog('批量测试结果已导出为CSV文件', 'success');
    });
    
    // 初始化日志
    addLog('工具初始化完成。批量测试工具已就绪，支持强制IPv4解决重定向问题。', 'info');
    addLog('提示: 测试记录功能已启用，测试完成后会自动保存配置，最多保存20条记录。', 'info');
});