document.addEventListener('DOMContentLoaded', function() {
    // 元素引用
    const sendBtn = document.getElementById('send-btn');
    const clearBtn = document.getElementById('clear-btn');
    const exampleBtn = document.getElementById('example-btn');
    const loading = document.getElementById('loading');
    const responseContainer = document.getElementById('response-container');
    const noResponse = document.getElementById('no-response');
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const historyList = document.getElementById('history-list');
    const logContainer = document.getElementById('log-container');
    
    const redirectCountText = document.getElementById('redirect-count'); 
    const redirectCountBadge = document.getElementById('redirect-count-badge'); 
    const headersBadge = document.getElementById('headers-badge');

    // ==================== 新增：后端连接检查函数 ====================
    function checkBackendConnection(context = '') {
        const contextText = context ? `(${context})` : '';
        
        return fetch('proxy.php', { method: 'HEAD' })
            .then(res => {
                if (res.ok) {
                    addLog(`PHP代理后端连接正常 ${contextText}`, 'success');
                    return true;
                } else {
                    addLog(`PHP代理后端连接失败${contextText}，状态码: ${res.status}`, 'error');
                    return false;
                }
            })
            .catch(err => {
                addLog(`无法连接到proxy.php${contextText}: ${err.message}`, 'error');
                return false;
            });
    }

    // ==================== 新增：历史记录存储功能 ====================
    const HISTORY_STORAGE_KEY = 'requestHistory';
    const MAX_HISTORY_ITEMS = 50; // 最多保存50条历史记录
    const VISIBLE_HISTORY_ITEMS = 5; // 初始显示5条

    // 保存历史记录到localStorage
    function saveHistoryItem(config, result) {
        let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
        
        // 创建历史记录项
        const historyItem = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            displayTime: formatTime(new Date()),
            url: config.url,
            config: {
                url: config.url,
                host: config.host || '',
                userAgent: config.headers['User-Agent'] || '',
                referer: config.headers['Referer'] || '',
                otherHeaders: config.otherHeaders || '',
                timeout: config.timeout || 8,
                proxyAddress: config.proxy || '',
                proxyUsername: config.proxy_username || '',
                proxyPassword: config.proxy_password || '',
                followRedirects: config.follow_redirects ? 'auto' : 'none',
                maxRedirects: config.max_redirects || 10
            },
            result: {
                status: result.status_code || 0,
                time: result.time || 0,
                size: result.size || 0,
                redirectCount: result.redirect_count || 0
            }
        };
        
        // 检查是否已存在相同的URL和配置
        const existingIndex = history.findIndex(item => {
            return item.url === historyItem.url && 
                   JSON.stringify(item.config) === JSON.stringify(historyItem.config);
        });
        
        if (existingIndex !== -1) {
            // 更新已有记录的时间和结果，并移动到最前面
            history[existingIndex].timestamp = historyItem.timestamp;
            history[existingIndex].displayTime = historyItem.displayTime;
            history[existingIndex].result = historyItem.result;
            
            // 从原位置删除并添加到最前面
            const updatedItem = history.splice(existingIndex, 1)[0];
            history.unshift(updatedItem);
            
            addLog('已更新历史记录并置顶', 'info');
        } else {
            // 添加到开头
            history.unshift(historyItem);
            addLog('已保存新历史记录', 'info');
        }
        
        // 限制历史记录数量
        if (history.length > MAX_HISTORY_ITEMS) {
            history = history.slice(0, MAX_HISTORY_ITEMS);
        }
        
        // 保存到localStorage
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
        
        return history;
    }

    // 格式化时间为 HH:MM:SS
    function formatTime(date) {
        return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}:${date.getSeconds().toString().padStart(2,'0')}`;
    }

    // 格式化时间为更友好的显示
    function formatDisplayTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) {
            return '刚刚';
        } else if (diffMins < 60) {
            return `${diffMins}分钟前`;
        } else if (diffHours < 24) {
            return `${diffHours}小时前`;
        } else if (diffDays < 7) {
            return `${diffDays}天前`;
        } else {
            return `${date.getMonth()+1}/${date.getDate()} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
        }
    }

    // 加载历史记录
    function loadHistory() {
        const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
        updateHistoryDisplay(history);
        return history;
    }

    // 清除所有历史记录
    function clearAllHistory() {
        if (confirm('确定要清除所有历史记录吗？此操作不可恢复。')) {
            localStorage.removeItem(HISTORY_STORAGE_KEY);
            updateHistoryDisplay([]);
            addLog('已清除所有历史记录', 'info');
        }
    }

    // 更新历史记录显示
    function updateHistoryDisplay(history) {
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="history-item placeholder">
                    <div class="history-url">暂无请求历史</div>
                </div>`;
            return;
        }
        
        // 创建历史记录容器
        const historyContainer = document.createElement('div');
        historyContainer.className = 'history-container';
        
        history.forEach((item, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'history-item';
            if (index >= VISIBLE_HISTORY_ITEMS) {
                itemEl.classList.add('history-hidden');
            }
            itemEl.setAttribute('data-id', item.id);
            
            // 格式化时间
            const date = new Date(item.timestamp);
            const timeStr = formatTime(date);
            const displayTime = formatDisplayTime(item.timestamp);
            
            const statusClass = item.result.status >= 200 && item.result.status < 300 ? 'status-success' : 
                              item.result.status >= 300 && item.result.status < 400 ? 'status-warning' : 'status-error';
            
            itemEl.innerHTML = `
                <div class="history-info">
                    <div class="history-url" title="${item.url}">${item.url}</div>
                    <div class="history-details">
                        <span class="history-time" title="${timeStr}">${displayTime}</span>
                        <span class="status-badge ${statusClass} history-status">${item.result.status}</span>
                        <span>${item.result.redirectCount}次重定向</span>
                        <span>${(item.result.time * 1000).toFixed(0)}ms</span>
                        <span>${formatBytes(item.result.size)}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="history-fill-btn" title="回填配置">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <button class="history-delete-btn" title="删除记录">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            
            // 回填按钮事件
            const fillBtn = itemEl.querySelector('.history-fill-btn');
            fillBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                fillFormWithConfig(item.config);
                addLog(`已加载历史配置: ${item.url}`, 'info');
                
                // 移动到最前面
                moveHistoryToTop(item.id);
            });
            
            // 删除按钮事件
            const deleteBtn = itemEl.querySelector('.history-delete-btn');
            deleteBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteHistoryItem(item.id);
            });
            
            // 整个项目点击事件（回填配置）
            itemEl.addEventListener('click', function(e) {
                if (!e.target.closest('.history-actions')) {
                    fillFormWithConfig(item.config);
                    addLog(`已加载历史配置: ${item.url}`, 'info');
                    
                    // 移动到最前面
                    moveHistoryToTop(item.id);
                }
            });
            
            historyContainer.appendChild(itemEl);
        });
        
        // 添加"显示更多/收起"按钮
        if (history.length > VISIBLE_HISTORY_ITEMS) {
            const toggleBtn = document.createElement('div');
            toggleBtn.className = 'history-toggle-btn';
            toggleBtn.innerHTML = `
                <span>显示全部 (${history.length})</span>
                <i class="fas fa-chevron-down"></i>
            `;
            
            toggleBtn.addEventListener('click', function() {
                const hiddenItems = historyContainer.querySelectorAll('.history-hidden');
                const isHidden = hiddenItems.length > 0;
                
                if (isHidden) {
                    // 显示全部
                    hiddenItems.forEach(item => {
                        item.classList.remove('history-hidden');
                    });
                    toggleBtn.innerHTML = '<span>收起</span><i class="fas fa-chevron-up"></i>';
                    toggleBtn.classList.add('expanded');
                } else {
                    // 收起部分
                    const allItems = historyContainer.querySelectorAll('.history-item');
                    allItems.forEach((item, index) => {
                        if (index >= VISIBLE_HISTORY_ITEMS) {
                            item.classList.add('history-hidden');
                        }
                    });
                    toggleBtn.innerHTML = `<span>显示全部 (${history.length})</span><i class="fas fa-chevron-down"></i>`;
                    toggleBtn.classList.remove('expanded');
                }
            });
            
            historyContainer.appendChild(toggleBtn);
        }
        
        // 添加清除所有按钮
        const clearAllBtn = document.createElement('div');
        clearAllBtn.className = 'history-clear-all';
        clearAllBtn.innerHTML = '<i class="fas fa-trash"></i> 清除所有历史记录';
        clearAllBtn.addEventListener('click', clearAllHistory);
        
        historyContainer.appendChild(clearAllBtn);
        historyList.appendChild(historyContainer);
    }

    // 将历史记录移动到最前面
    function moveHistoryToTop(id) {
        let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
        const index = history.findIndex(item => item.id === id);
        
        if (index !== -1) {
            // 更新时间为当前时间
            history[index].timestamp = new Date().toISOString();
            history[index].displayTime = formatTime(new Date());
            
            // 移动到最前面
            const item = history.splice(index, 1)[0];
            history.unshift(item);
            
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
            
            // 重新加载显示
            loadHistory();
        }
    }

    // 删除单个历史记录
    function deleteHistoryItem(id) {
        if (confirm('确定要删除这条历史记录吗？')) {
            let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)) || [];
            history = history.filter(item => item.id !== id);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
            updateHistoryDisplay(history);
            addLog('已删除历史记录', 'info');
        }
    }

    // 回填配置到表单
    function fillFormWithConfig(config) {
        // 基本URL
        document.getElementById('url').value = config.url || '';
        
        // Hosts配置
        document.getElementById('host').value = config.host || '';
        
        // 请求头配置
        document.getElementById('user-agent').value = config.userAgent || 'Okhttp/3.15';
        document.getElementById('referer').value = config.referer || '';
        document.getElementById('other-headers').value = config.otherHeaders || '';
        
        // 超时时间
        document.getElementById('timeout').value = config.timeout || 8;
        
        // 代理配置
        document.getElementById('proxy-address').value = config.proxyAddress || '';
        document.getElementById('proxy-username').value = config.proxyUsername || '';
        document.getElementById('proxy-password').value = config.proxyPassword || '';
        
        // 重定向配置
        document.getElementById('follow-redirects').value = config.followRedirects || 'auto';
        document.getElementById('max-redirects').value = config.maxRedirects || 10;
        
        // 滚动到顶部
        window.scrollTo(0, 0);
        
        // 高亮显示已加载的配置
        const urlInput = document.getElementById('url');
        urlInput.style.backgroundColor = '#e8f5e9';
        urlInput.style.borderColor = '#4caf50';
        setTimeout(() => {
            urlInput.style.backgroundColor = '';
            urlInput.style.borderColor = '';
        }, 1000);
    }

    // ==================== 原有代码 ====================
    // 折叠面板
    const sectionToggles = document.querySelectorAll('.compact-group-title');
    sectionToggles.forEach(toggle => {
        const sectionId = toggle.id.replace('-toggle', '-content');
        const content = document.getElementById(sectionId);
        const arrow = toggle.querySelector('.compact-group-arrow');

        toggle.addEventListener('click', function() {
            content.classList.toggle('expanded');
            arrow.classList.toggle('fa-chevron-up');
            arrow.classList.toggle('fa-chevron-down');
        });
    });

    // 标签页切换
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(tabId + '-tab').classList.add('active');
        });
    });

    // 工具函数
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getHttpReasonPhrase(code) {
        const reasons = {
            200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content',
            301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 
            307: 'Temporary Redirect', 308: 'Permanent Redirect', 
            400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
            405: 'Method Not Allowed', 408: 'Request Timeout', 429: 'Too Many Requests',
            500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
            504: 'Gateway Timeout'
        };
        return reasons[code] || 'Unknown Status';
    }

    function updateRedirectDisplay(redirects) {
        const container = document.getElementById('redirect-chain-container');
        container.innerHTML = '';
        document.getElementById('final-url-container').style.display = 'none';

        if (!redirects || redirects.length === 0) {
            container.innerHTML = `<div class="no-redirects">
                <i class="fas fa-arrow-right" style="font-size: 28px; color: var(--text-secondary); margin-bottom: 10px;"></i>
                <p>直连成功，无重定向</p>
                <small style="color: var(--text-secondary);">请求直接到达最终地址</small>
            </div>`;
            return;
        }

        document.getElementById('final-url-container').style.display = 'block';

        redirects.forEach((step, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'redirect-step';

            const isFinal = index === redirects.length - 1;
            
            // 对最终响应步骤添加高亮 class
            if (isFinal) {
                stepDiv.classList.add('final-response-step');
            }

            const statusClass = step.status_code >= 200 && step.status_code < 400 
                ? (step.status_code >= 300 ? 'status-warning' : 'status-success') 
                : 'status-error';

            const headerHTML = `<div class="redirect-step-header">
                <span class="redirect-seq-badge ${statusClass}">${index + 1}</span>
                <span class="status-badge ${statusClass}">
                    ${step.status_code} ${getHttpReasonPhrase(step.status_code)}
                </span>
                ${isFinal ? '<span style="font-size: 0.9rem;margin-left: 10px; font-weight: bold; color: var(--secondary-color);">← 最终响应</span>' : ''}
            </div>`;
            
            const urlHTML = `<div class="redirect-step-url">${step.url}</div>`;

            stepDiv.innerHTML = headerHTML + urlHTML;
            container.appendChild(stepDiv);
        });
        
        // 最终URL
        document.getElementById('final-url').textContent = redirects[redirects.length - 1].url;
    }

    function updateHeadersDisplay(headers) {
        const tbody = document.getElementById('headers-body');
        tbody.innerHTML = '';
        
        if (!headers || Object.keys(headers).length === 0) {
            tbody.innerHTML = '<tr><td colspan="2">无响应头</td></tr>';
            return;
        }
        
        for (const [key, value] of Object.entries(headers)) {
            const row = tbody.insertRow();
            const cell1 = row.insertCell();
            const cell2 = row.insertCell();
            cell1.textContent = key;
            cell2.textContent = value;
        }
    }

    function updateBodyDisplay(body, headers, downloadUrl = null, data = {}) {
        const pre = document.getElementById('response-body');
        const tabContent = document.getElementById('body-tab');
        
        // 清除之前可能存在的下载区域
        const existingDownloadSection = tabContent.querySelector('.download-section');
        if (existingDownloadSection) {
            existingDownloadSection.remove();
        }
        
        // 检查是否跳过了响应体获取
        const skipBody = data.skip_body || false;
        const fileType = data.file_type || '';
        const isM3U8 = data.is_m3u8 || false;
        
        // 检查内容类型
        const contentType = headers && headers['content-type'] ? headers['content-type'].toLowerCase() : '';
        const isM3U8Content = contentType.includes('application/x-mpegurl') || 
                              contentType.includes('application/vnd.apple.mpegurl') ||
                              contentType.includes('audio/x-mpegurl') ||
                              (body && body.trim().startsWith('#EXTM3U'));
        
        // 检查是否为截断的响应
        const isTruncated = data.truncated || false;
        
        // 检查是否有下载可用
        const downloadAvailable = data.download_available || false;
        
        // 处理跳过了响应体获取的情况（大文件或媒体文件，但不包括M3U8）
        if (skipBody && !isM3U8 && !isM3U8Content) {
            pre.textContent = body; // body 已经在后端包含了文件信息
            
            // 根据文件类型创建不同的信息区域
            if (fileType === 'media') {
                createMediaFileSection(pre, headers, data);
            } else if (fileType === 'large_file') {
                createLargeFileSection(pre, headers, data);
            }
            return;
        }
        
        // 处理M3U8文件 - 直接显示原始内容
        if (isM3U8 || isM3U8Content) {
            // 对于M3U8文件，直接显示完整内容
            pre.textContent = body;
            
            // 添加M3U8特定样式类
            pre.classList.add('m3u8-content');
            
            // 添加M3U8操作按钮区域
            createM3U8ActionButtons(pre, headers, data, downloadUrl, downloadAvailable);
            return;
        }
        
        // 处理普通响应
        if (isTruncated && downloadUrl) {
            // 响应体被截断且有下载链接
            pre.textContent = body;
            createDownloadSection(pre, body, contentType, downloadUrl, false, true, data.size);
        } else if (isTruncated && !downloadUrl) {
            // 响应体被截断但没有下载链接
            pre.textContent = body;
            createNoDownloadSection(pre, body, contentType, false, true);
        } else if (body) {
            // 正常显示完整内容
            if (body.length > 5000) {
                pre.textContent = body.substring(0, 5000) + '\n\n... (响应体过长，仅显示前5000字符) ...';
            } else {
                pre.textContent = body;
            }
        } else if (contentType.includes('video/') || contentType.includes('audio/')) {
            // 二进制内容但响应体为空
            const size = headers && headers['content-length'] ? 
                formatBytes(parseInt(headers['content-length'])) : '未知大小';
            pre.textContent = `[二进制或流媒体内容] 类型: ${contentType}，大小: ${size}`;
        } else {
            pre.textContent = '响应体为空';
        }
    }

    // 新增：创建M3U8操作按钮区域（只有按钮，没有信息区域）
    function createM3U8ActionButtons(pre, headers, data, downloadUrl, downloadAvailable) {
        const actionSection = document.createElement('div');
        actionSection.className = 'download-section m3u8-actions';
        actionSection.style.marginTop = '10px';
        actionSection.style.padding = '10px';
        actionSection.style.backgroundColor = '#f8f9fa';
        actionSection.style.borderRadius = '6px';
        actionSection.style.border = '1px solid var(--border-color)';
        
        // 解析M3U8内容，获取基本信息
        let lineCount = 0;
        let tsCount = 0;
        let duration = 0;
        if (data.body) {
            const lines = data.body.split('\n');
            lineCount = lines.length;
            let currentDuration = 0;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#EXTINF:')) {
                    const match = trimmed.match(/#EXTINF:([\d\.]+)/);
                    if (match) {
                        currentDuration = parseFloat(match[1]);
                    }
                } else if (trimmed && !trimmed.startsWith('#') && (trimmed.endsWith('.ts') || trimmed.includes('.ts?'))) {
                    tsCount++;
                    duration += currentDuration;
                    currentDuration = 0;
                }
            }
        }
        
        actionSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <div style="font-size: 0.85em; color: var(--text-secondary);">
                    共 ${lineCount} 行，${tsCount} 个TS片段${duration > 0 ? `，总时长 ${duration.toFixed(1)} 秒` : ''}
                </div>
                <div style="flex: 1;"></div>
                ${downloadAvailable ? `
                <button class="btn download-m3u8-btn" style="background-color: var(--secondary-color); padding: 6px 12px; font-size: 0.85rem;">
                    <i class="fas fa-download"></i> 下载M3U8
                </button>
                ` : ''}
                <button class="btn copy-m3u8-btn" style="background-color: var(--primary-color); padding: 6px 12px; font-size: 0.85rem;">
                    <i class="fas fa-copy"></i> 复制内容
                </button>
            </div>
        `;
        
        // 添加下载事件
        if (downloadAvailable) {
            const downloadBtn = actionSection.querySelector('.download-m3u8-btn');
            if (downloadBtn) {
                downloadBtn.onclick = function() {
                    downloadFile(downloadUrl, 'playlist.m3u8');
                    addLog('开始下载M3U8文件...', 'info');
                };
            }
        }
        
        // 添加复制事件
        const copyBtn = actionSection.querySelector('.copy-m3u8-btn');
        if (copyBtn) {
            copyBtn.onclick = function() {
                copyToClipboard(data.body || '');
                this.innerHTML = '<i class="fas fa-check"></i> 已复制';
                this.style.backgroundColor = 'var(--secondary-color)';
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-copy"></i> 复制内容';
                    this.style.backgroundColor = 'var(--primary-color)';
                }, 2000);
                addLog('已复制M3U8内容到剪贴板', 'success');
            };
        }
        
        pre.parentNode.insertBefore(actionSection, pre.nextSibling);
    }

    // 新增：复制到剪贴板函数
    function copyToClipboard(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    function createMediaFileSection(pre, headers, data) {
        const contentType = headers && headers['content-type'] ? headers['content-type'] : '未指定';
        
        // 检查是否为M3U8文件
        const isM3U8Content = contentType.includes('application/x-mpegurl') || 
                              contentType.includes('application/vnd.apple.mpegurl') ||
                              contentType.includes('audio/x-mpegurl');
        
        if (isM3U8Content) {
            // 如果是M3U8，不创建媒体文件信息区域
            return;
        }
        
        const mediaSection = document.createElement('div');
        mediaSection.className = 'download-section';
        mediaSection.style.backgroundColor = '#e3f2fd';
        mediaSection.style.borderColor = '#bbdefb';
        
        const contentLength = headers && headers['content-length'] ? 
            formatBytes(parseInt(headers['content-length'])) : '未知大小';
        const statusCode = data.status_code || '未知';
        
        mediaSection.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: 600; color: var(--primary-color);">
                <i class="fas fa-file-video"></i> 媒体文件信息
            </div>
            <div style="margin-bottom: 10px; font-size: 0.9em;">
                <div style="margin-bottom: 5px;">状态码: <strong>${statusCode}</strong></div>
                <div style="margin-bottom: 5px;">内容类型: <code>${contentType}</code></div>
                <div style="margin-bottom: 5px;">文件大小: <strong>${contentLength}</strong></div>
                <div style="margin-bottom: 5px;">最终URL: <small style="word-break: break-all;">${data.final_url || data.url}</small></div>
            </div>
            <div style="font-size: 0.85em; color: var(--text-secondary);">
                <i class="fas fa-info-circle"></i> 此文件为媒体文件（视频/音频），为节省资源未获取完整响应体。如需测试播放，请使用专门的播放器。
            </div>
        `;
        
        pre.parentNode.insertBefore(mediaSection, pre.nextSibling);
    }

    function createLargeFileSection(pre, headers, data) {
        const largeFileSection = document.createElement('div');
        largeFileSection.className = 'download-section';
        largeFileSection.style.backgroundColor = '#fff3cd';
        largeFileSection.style.borderColor = '#ffeaa7';
        largeFileSection.style.color = '#856404';
        
        const contentType = headers && headers['content-type'] ? headers['content-type'] : '未指定';
        const contentLength = headers && headers['content-length'] ? 
            formatBytes(parseInt(headers['content-length'])) : '未知大小';
        const statusCode = data.status_code || '未知';
        
        largeFileSection.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: 600; color: #856404;">
                <i class="fas fa-exclamation-triangle"></i> 大文件信息
            </div>
            <div style="margin-bottom: 10px; font-size: 0.9em;">
                <div style="margin-bottom: 5px;">状态码: <strong>${statusCode}</strong></div>
                <div style="margin-bottom: 5px;">内容类型: <code>${contentType}</code></div>
                <div style="margin-bottom: 5px;">文件大小: <strong>${contentLength}</strong> (超过2MB)</div>
                <div style="margin-bottom: 5px;">最终URL: <small style="word-break: break-all;">${data.final_url || data.url}</small></div>
            </div>
            <div style="font-size: 0.85em;">
                <i class="fas fa-info-circle"></i> 此文件大小超过2MB，为节省资源未获取完整响应体。如果这是您需要的文件，请直接使用下载工具。
            </div>
        `;
        
        pre.parentNode.insertBefore(largeFileSection, pre.nextSibling);
    }

    function createDownloadSection(pre, body, contentType, downloadUrl, isM3U8, isTruncated, originalSize = null) {
        const downloadSection = document.createElement('div');
        downloadSection.className = 'download-section';
        
        const displaySize = originalSize ? formatBytes(originalSize) : formatBytes(body.length);
        
        downloadSection.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: 600; color: var(--primary-color);">
                <i class="fas fa-download"></i> 下载完整响应
            </div>
            <div style="margin-bottom: 10px; font-size: 0.9em;">
                <div style="margin-bottom: 5px;">响应大小: <strong>${displaySize}</strong></div>
                <div style="margin-bottom: 5px;">内容类型: <code>${contentType || '未指定'}</code></div>
                ${isM3U8 ? '<div style="margin-bottom: 5px; color: var(--warning-color);"><i class="fas fa-exclamation-triangle"></i> 检测到M3U8播放列表</div>' : ''}
                ${isTruncated ? '<div style="margin-bottom: 5px; color: var(--info);"><i class="fas fa-info-circle"></i> 响应体已截断显示</div>' : ''}
            </div>
            <button class="btn download-full-btn" style="background-color: var(--secondary-color); padding: 8px 16px; font-size: 0.9rem;">
                <i class="fas fa-download"></i> 下载完整文件
            </button>
            <div style="margin-top: 10px; font-size: 0.85em; color: var(--text-secondary);">
                <i class="fas fa-info-circle"></i> 下载链接5分钟内有效
            </div>
        `;
        
        downloadSection.querySelector('.download-full-btn').onclick = function() {
            downloadFile(downloadUrl, getFilename(contentType, 'response'));
            addLog('开始下载完整响应文件...', 'info');
        };
        
        pre.parentNode.insertBefore(downloadSection, pre.nextSibling);
    }

    function createNoDownloadSection(pre, body, contentType, isM3U8, isTruncated) {
        const noDownloadSection = document.createElement('div');
        noDownloadSection.className = 'download-section';
        noDownloadSection.style.backgroundColor = '#fff3cd';
        noDownloadSection.style.borderColor = '#ffeaa7';
        
        noDownloadSection.innerHTML = `
            <div style="margin-bottom: 10px; font-weight: 600; color: var(--warning-color);">
                <i class="fas fa-exclamation-triangle"></i> 响应体过大但无法提供下载
            </div>
            <div style="margin-bottom: 10px; font-size: 0.9em;">
                内容类型: <code>${contentType || '未指定'}</code><br>
                ${isM3U8 ? '检测到M3U8播放列表<br>' : ''}
                ${isTruncated ? '响应体已截断显示前2000字符。<br>' : ''}
            </div>
            <div style="font-size: 0.85em; color: var(--text-secondary);">
                下载功能不可用，可能是服务器权限问题或响应类型不支持。
            </div>
        `;
        
        pre.parentNode.insertBefore(noDownloadSection, pre.nextSibling);
    }

    function getFilename(contentType, defaultName) {
        if (contentType.includes('application/json')) return `${defaultName}.json`;
        if (contentType.includes('text/html')) return `${defaultName}.html`;
        if (contentType.includes('text/plain')) return `${defaultName}.txt`;
        if (contentType.includes('application/x-mpegurl') || contentType.includes('application/vnd.apple.mpegurl')) 
            return `${defaultName}.m3u8`;
        if (contentType.includes('video/')) return `${defaultName}.${contentType.split('/')[1]}`;
        if (contentType.includes('audio/')) return `${defaultName}.${contentType.split('/')[1]}`;
        return `${defaultName}.bin`;
    }

    function downloadFile(url, filename) {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        document.body.appendChild(iframe);
        
        setTimeout(() => {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
        }, 30000);
    }

    function downloadAsText(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }, 100);
    }

    function addLog(message, type = 'info') {
        const logItem = document.createElement('div');
        logItem.className = 'log-item';
        
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        
        logItem.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-message ${type}">${message}</span>`;
        
        logContainer.prepend(logItem);
    }

    // ==================== 修改原有的addHistoryItem函数 ====================
    // 这个函数现在只用于临时显示，真正的存储由saveHistoryItem完成
    function addHistoryItem(url, time, redirectCount, status, responseTime, size) {
        // 这个函数现在保持原样，用于兼容旧的显示
        // 真正的存储和显示通过updateHistoryDisplay处理
    }
    
    // 清除按钮事件
    clearBtn.addEventListener('click', function() {
        document.getElementById('url').value = '';
        document.getElementById('host').value = '';
        document.getElementById('timeout').value = '8'; // 修正为8，与默认值一致
        document.getElementById('user-agent').value = 'Okhttp/3.15'; // 修正为默认值
        document.getElementById('referer').value = '';
        document.getElementById('other-headers').value = '';
        document.getElementById('proxy-address').value = '';
        document.getElementById('proxy-username').value = '';
        document.getElementById('proxy-password').value = '';
        document.getElementById('follow-redirects').value = 'auto';
        document.getElementById('max-redirects').value = '10';

        responseContainer.style.display = 'none';
        noResponse.style.display = 'block';
        logContainer.innerHTML = '';
        
        addLog('表单已清除', 'info');
    });
    
    // 示例按钮事件
    exampleBtn.addEventListener('click', function() {
        document.getElementById('url').value = 'http://221.213.200.40:6610/00000003/2/H_YINGSHI?virtualDomain=00000003.live_hls.zte.com&programid=xxx&stbid=hotel&userid=hotel';
        addLog('已填充示例直播源', 'info');
    });

    // 密码显示/隐藏功能
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('proxy-password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', function() {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // 切换图标
            const icon = this.querySelector('i');
            if (type === 'text') {
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                this.setAttribute('title', '隐藏密码');
            } else {
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                this.setAttribute('title', '显示密码');
            }
        });
        
        // 添加标题提示
        togglePasswordBtn.setAttribute('title', '显示密码');
    }

    // 发送请求事件
    sendBtn.addEventListener('click', function() {
        const url = document.getElementById('url').value.trim();
        if (!url) {
            addLog('请输入直播源URL', 'error');
            return;
        }

        loading.classList.add('active');
        responseContainer.style.display = 'none';
        noResponse.style.display = 'none';

        const headers = {
            'User-Agent': document.getElementById('user-agent').value,
            'Referer': document.getElementById('referer').value,
        };
        
        const otherHeadersText = document.getElementById('other-headers').value;
        const otherHeadersArray = [];
        otherHeadersText.split('\n').forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const value = parts.slice(1).join(':').trim();
                if (name) {
                    headers[name] = value;
                    otherHeadersArray.push(`${name}: ${value}`);
                }
            }
        });
        
        const requestData = {
            url: url,
            method: 'GET',
            host: document.getElementById('host').value.trim(),
            timeout: parseInt(document.getElementById('timeout').value),
            proxy: document.getElementById('proxy-address').value.trim(),
            proxy_username: document.getElementById('proxy-username').value.trim(),
            proxy_password: document.getElementById('proxy-password').value.trim(),
            follow_redirects: document.getElementById('follow-redirects').value === 'auto',
            max_redirects: parseInt(document.getElementById('max-redirects').value),
            headers: headers,
            otherHeaders: otherHeadersText
        };
        
        addLog(`正在发送请求: ${url}`, 'info');

        fetch('proxy.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        })
        .then(res => {
            // 首先检查响应状态
            if (!res.ok) {
                throw new Error(`HTTP错误: ${res.status} ${res.statusText}`);
            }
            
            // 获取响应文本
            return res.text().then(text => {
                // 尝试解析JSON
                try {
                    if (!text || text.trim() === '') {
                        throw new Error('服务器返回空响应');
                    }
                    return JSON.parse(text);
                } catch (e) {
                    // 如果JSON解析失败，抛出包含原始响应的错误
                    console.error('JSON解析失败，原始响应:', text.substring(0, 500));
                    throw new Error(`JSON解析失败: ${e.message}，响应: ${text.substring(0, 200)}...`);
                }
            });
        })
        .then(data => {
            console.log("API响应数据:", data);
            
            loading.classList.remove('active');
            responseContainer.style.display = 'block';

            // 检查是否有错误字段
            if (data.error) {
                throw new Error(`服务器错误: ${data.error}`);
            }

            const code = data.status_code;
            const statusBadge = document.getElementById('response-status');
            
            document.getElementById('response-time').textContent = `${(data.time * 1000).toFixed(0)} ms`;
            document.getElementById('response-size').textContent = formatBytes(data.size);
            
            const redirectCount = data.redirect_count || (data.redirects && data.redirects.length > 0 ? data.redirects.length - 1 : 0);
            const chainLength = data.redirects ? data.redirects.length : 0;
            
            redirectCountText.textContent = `${redirectCount} 次`;
            redirectCountBadge.textContent = chainLength;
            
            const headerCount = data.headers ? Object.keys(data.headers).length : 0;
            headersBadge.textContent = headerCount;

            statusBadge.textContent = `HTTP/${data.http_version || '1.1'} ${code} ${getHttpReasonPhrase(code)}`;
            if (code >= 200 && code < 300) statusBadge.className = 'status-badge status-success';
            else if (code >= 300 && code < 400) statusBadge.className = 'status-badge status-warning';
            else statusBadge.className = 'status-badge status-error';

            updateRedirectDisplay(data.redirects || []);
            updateHeadersDisplay(data.headers || {});
            updateBodyDisplay(data.body || '', data.headers || {}, data.download_url || null, data);

            // 保存到历史记录
            saveHistoryItem(requestData, data);
            loadHistory();

            addLog(`请求成功: HTTP ${code} (${(data.time * 1000).toFixed(0)}ms，大小 ${formatBytes(data.size)})`, 'success');
        })
        .catch(err => {
            loading.classList.remove('active');
            responseContainer.style.display = 'none';
            noResponse.style.display = 'block';
            
            // 显示更详细的错误信息
            const errorMessage = err.message || '未知错误';
            document.getElementById('response-status').textContent = errorMessage;
            document.getElementById('response-status').className = 'status-badge status-error';
            document.getElementById('response-time').textContent = '0 ms';
            document.getElementById('response-size').textContent = '0 B';
            redirectCountText.textContent = '0 次';
            redirectCountBadge.textContent = '0';
            headersBadge.textContent = '0';
            
            addLog(`请求失败: ${errorMessage}`, 'error');
            console.error('请求详细错误:', err);
            
            // 请求失败时检查后端连接
            checkBackendConnection('请求失败后检查');
        });
    });

    // 检查后端 (HEAD现在可以正确返回200)
    checkBackendConnection('页面加载');
        
    // 首次加载时折叠配置面板
    document.getElementById('headers-content').classList.remove('expanded');
    document.getElementById('proxy-content').classList.remove('expanded');
    document.getElementById('redirect-content').classList.remove('expanded');
    
    // ==================== 新增：页面加载时加载历史记录 ====================
    loadHistory();
});