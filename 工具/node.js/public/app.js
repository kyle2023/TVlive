// app.js - 代理检测工具前端逻辑

const API_BASE = '/api';
const HISTORY_KEY = 'proxy_check_history';
const MAX_HISTORY = 20;

let activeRun = null;
let resultRecords = [];
let activeStatusFilter = 'all';
let activeProtocolFilters = [];
let map = null;
let mapLayers = [];
let redLocationIcon = null;
let currentMapToken = 0;

const PROTOCOL_FILTERS = [
    { key: 'socks5', label: 'SOCKS5' },
    { key: 'http', label: 'HTTP' },
    { key: 'https', label: 'HTTPS' }
];
const STATUS_FILTERS = [
    { key: 'all', label: '全部' },
    { key: 'success', label: '有效' },
    { key: 'error', label: '无效' }
];

// DOM 元素
const inputSingle = document.getElementById('inputList');
const inputBatch = document.getElementById('inputListBatch');
const batchMode = document.getElementById('batchMode');
const checkBtn = document.getElementById('checkBtn');
const resultsDiv = document.getElementById('results');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const summaryHeadline = document.getElementById('summaryHeadline');
const summaryDescription = document.getElementById('summaryDescription');
const statTotal = document.getElementById('statTotal');
const statSuccess = document.getElementById('statSuccess');
const statPending = document.getElementById('statPending');
const statFailed = document.getElementById('statFailed');
const resultMeta = document.getElementById('resultMeta');
const resultPill = document.getElementById('resultPill');
const resultsEmpty = document.getElementById('resultsEmpty');
const emptyStateTitle = document.getElementById('emptyStateTitle');
const emptyStateDescription = document.getElementById('emptyStateDescription');
const resultsFilters = document.getElementById('resultsFilters');
const filterToggle = document.getElementById('filterToggle');
const filterPanel = document.getElementById('filterPanel');
const filterToggleText = document.getElementById('filterToggleText');
const statusFilterGroup = document.getElementById('statusFilterGroup');
const protocolFilterGroup = document.getElementById('protocolFilterGroup');
const filterEmpty = document.getElementById('filterEmpty');
const themeToggle = document.getElementById('themeToggle');
const historyToggle = document.getElementById('historyToggle');
const historyDropdown = document.getElementById('historyDropdown');

// ==================== 初始化输入框状态 ====================
if (inputSingle) inputSingle.style.display = 'block';
if (inputBatch) inputBatch.style.display = 'none';

// ==================== 历史记录功能 ====================

function getHistory() {
    try {
        const history = localStorage.getItem(HISTORY_KEY);
        return history ? JSON.parse(history) : [];
    } catch {
        return [];
    }
}

function saveHistory(proxy) {
    if (!proxy || proxy.trim() === '') return;
    let history = getHistory();
    history = history.filter(item => item !== proxy);
    history.unshift(proxy);
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
}

function renderHistory() {
    const history = getHistory();
    if (!historyDropdown) return;
    
    if (history.length === 0) {
        historyDropdown.innerHTML = '<div class="history-empty">暂无检测记录</div>';
        return;
    }
    
    historyDropdown.innerHTML = history.map(item => `
        <div class="history-item" data-proxy="${escapeHtml(item)}">${escapeHtml(item)}</div>
    `).join('') + '<div class="history-clear">清除所有记录</div>';
    
    historyDropdown.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => {
            const proxy = el.dataset.proxy;
            const isBatch = batchMode ? batchMode.checked : false;
            if (isBatch && inputBatch) {
                inputBatch.value = proxy;
            } else if (inputSingle) {
                inputSingle.value = proxy;
            }
            historyDropdown.classList.remove('show');
            setTimeout(() => startCheck(), 100);
        });
    });
    
    const clearBtn = historyDropdown.querySelector('.history-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            clearHistory();
        });
    }
}

if (historyToggle && historyDropdown) {
    historyToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        historyDropdown.classList.toggle('show');
        renderHistory();
    });
    
    document.addEventListener('click', (e) => {
        if (historyToggle && historyDropdown && 
            !historyToggle.contains(e.target) && 
            !historyDropdown.contains(e.target)) {
            historyDropdown.classList.remove('show');
        }
    });
}

// ==================== 主题 ====================

function initTheme() {
    const stored = localStorage.getItem('cf_proxy_theme');
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (dark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
}
initTheme();

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme;
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        localStorage.setItem('cf_proxy_theme', next);
    });
}

// ==================== 模式切换 ====================

if (batchMode) {
    batchMode.addEventListener('change', () => {
        const modeLabel = document.getElementById('modeLabel');
        const fieldHint = document.getElementById('fieldHint');
        const isBatch = batchMode.checked;
        
        if (modeLabel) modeLabel.innerText = isBatch ? 'Batch / 多目标' : 'Single / 单目标';
        if (fieldHint) fieldHint.innerText = isBatch 
            ? '批量模式：每行一个目标，按 Ctrl+Enter 开始检测'
            : '单目标模式：输入单个代理地址，按 Enter 开始检测';
        
        if (isBatch && inputBatch && inputSingle) {
            if (inputSingle.value) {
                inputBatch.value = inputSingle.value;
            }
            inputSingle.style.display = 'none';
            inputBatch.style.display = 'block';
        } else if (inputBatch && inputSingle) {
            if (inputBatch.value) {
                const firstLine = inputBatch.value.split('\n')[0].trim();
                inputSingle.value = firstLine;
            }
            inputSingle.style.display = 'block';
            inputBatch.style.display = 'none';
        }
    });
}

// 快捷键
if (inputSingle) {
    inputSingle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !activeRun) {
            e.preventDefault();
            startCheck();
        }
    });
}
if (inputBatch) {
    inputBatch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !activeRun) {
            e.preventDefault();
            startCheck();
        }
    });
}

// 筛选器折叠
if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', () => {
        const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
        filterToggle.setAttribute('aria-expanded', !expanded);
        filterPanel.hidden = expanded;
    });
}

// ==================== 工具函数 ====================

function updateProgress(completed, total) {
    const percent = total > 0 ? (completed / total * 100) : 0;
    if (progressBar) progressBar.style.width = percent + '%';
    if (progressText) progressText.innerText = `${completed} / ${total}`;
}

function updateStats() {
    const total = resultRecords.length;
    const success = resultRecords.filter(r => r.status === 'success').length;
    const failed = resultRecords.filter(r => r.status === 'error').length;
    const pending = resultRecords.filter(r => r.status === 'pending').length;
    if (statTotal) statTotal.innerText = total;
    if (statSuccess) statSuccess.innerText = success;
    if (statFailed) statFailed.innerText = failed;
    if (statPending) statPending.innerText = pending;
}

function setAppState(state, total, completed, success) {
    const states = {
        idle: { headline: '等待输入', description: '输入目标后开始检测', meta: '结果会在这里展示', pill: 'Idle' },
        resolving: { headline: '正在解析目标', description: '正在解析域名...', meta: '解析阶段进行中', pill: 'Resolving' },
        running: { headline: `正在检测 ${total} 个目标`, description: `已完成 ${completed} 个，有效 ${success} 个`, meta: `${completed}/${total} 已完成`, pill: 'Running' },
        done: { headline: '检测完成', description: `有效 ${success}/${total}`, meta: '本轮检测已结束', pill: 'Completed' },
        empty: { headline: '未解析到目标', description: '请检查输入格式', meta: '没有有效目标', pill: 'Empty' },
        error: { headline: '检测出错', description: '请求异常', meta: '运行中断', pill: 'Error' },
        stopped: { headline: '已停止', description: `已完成 ${completed}/${total}`, meta: '已手动停止', pill: 'Stopped' }
    };
    const s = states[state] || states.idle;
    if (summaryHeadline) summaryHeadline.innerText = s.headline;
    if (summaryDescription) summaryDescription.innerText = s.description;
    if (resultMeta) resultMeta.innerText = s.meta;
    if (resultPill) {
        resultPill.innerText = s.pill;
        resultPill.className = `results-pill state-${state}`;
    }
}

function getProxyList() {
    const isBatch = batchMode ? batchMode.checked : false;
    
    if (isBatch && inputBatch) {
        const text = inputBatch.value;
        let lines = text.split('\n').filter(l => l.trim());
        return lines.map(l => l.trim()).filter(l => l);
    } else if (inputSingle) {
        const value = inputSingle.value.trim();
        return value ? [value] : [];
    }
    return [];
}

function getProxyType(target) {
    if (target.startsWith('socks5://')) return 'socks5';
    if (target.startsWith('http://')) return 'http';
    if (target.startsWith('https://')) return 'https';
    return 'socks5';
}

async function resolveBatch(targets, signal) {
    const res = await fetch(`${API_BASE}/resolve-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
        signal
    });
    const data = await res.json();
    return data.results || [];
}

async function checkProxy(proxy, signal) {
    // 如果没有协议头，默认添加 socks5://
    let fullProxy = proxy;
    if (!/^(socks5|http|https):\/\//i.test(proxy)) {
        fullProxy = 'socks5://' + proxy;
    }
    const url = `${API_BASE}/check?proxy=${encodeURIComponent(fullProxy)}`;
    const res = await fetch(url, { signal });
    return res.json();
}

function initMap() {
    if (map) return;
    map = L.map('global-map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19
}).addTo(map);
}

function getRedLocationIcon() {
    if (!redLocationIcon) {
        redLocationIcon = L.divIcon({
            className: 'red-location-marker',
            html: '<div style="background:#ef4444;width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
    }
    return redLocationIcon;
}

function clearMapLayers() {
    if (mapLayers.length) {
        mapLayers.forEach(layer => map.removeLayer(layer));
        mapLayers = [];
    }
}

async function showDetails(button, exitData) {
    const item = button.closest('.result-item');
    const container = item.querySelector('.map-container-wrapper');
    const isOpen = container && container.style.display === 'block';
    const token = ++currentMapToken;
    
    document.querySelectorAll('.map-container-wrapper').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.exit-ip-btn.is-active').forEach(btn => btn.classList.remove('is-active'));
    
    if (isOpen && container) {
        container.style.display = 'none';
        return;
    }
    
    button.classList.add('is-active');
    if (container) {
        container.style.display = 'block';
        const basicCard = container.querySelector('.exit-basic-info-card');
        const securityCard = container.querySelector('.exit-security-info-card');
        
        // 构建完整位置字符串（国家 · 省份 · 城市）
        const locationParts = [];
        if (exitData.country) locationParts.push(exitData.country);
        if (exitData.region && exitData.region !== exitData.country) locationParts.push(exitData.region);
        if (exitData.city && exitData.city !== exitData.region) locationParts.push(exitData.city);
        const fullLocation = locationParts.join(' · ') || '未知';
        
        if (basicCard && exitData) {
            basicCard.innerHTML = `<h4 class="exit-detail-section-title">基本信息</h4><div class="exit-detail-list">
                <div class="exit-detail-item"><span class="exit-detail-label">IP</span><span class="exit-detail-value">${escapeHtml(exitData.ip || '未知')}</span></div>
                <div class="exit-detail-item"><span class="exit-detail-label">位置</span><span class="exit-detail-value">${escapeHtml(fullLocation)}</span></div>
                <div class="exit-detail-item"><span class="exit-detail-label">运营商</span><span class="exit-detail-value">${escapeHtml(exitData.isp || exitData.org || '未知')}</span></div>
            </div>`;
        }
        if (securityCard && exitData) {
            securityCard.innerHTML = `<h4 class="exit-detail-section-title">网络信息</h4><div class="exit-detail-list">
                <div class="exit-detail-item"><span class="exit-detail-label">ASN</span><span class="exit-detail-value">${escapeHtml(exitData.as || '')}</span></div>
                <div class="exit-detail-item"><span class="exit-detail-label">组织</span><span class="exit-detail-value">${escapeHtml(exitData.org || '')}</span></div>
            </div>`;
        }
        
        initMap();
        const mapSlot = container.querySelector('.map-detail-map-slot');
        if (mapSlot) {
            mapSlot.innerHTML = '';
            mapSlot.appendChild(document.getElementById('global-map'));
        }
        
        setTimeout(async () => {
            if (token !== currentMapToken) return;
            map.invalidateSize();
            clearMapLayers();
            if (exitData && exitData.lat && exitData.lon) {
                const marker = L.marker([exitData.lat, exitData.lon], { icon: getRedLocationIcon() }).addTo(map);
                marker.bindPopup(`<b>${escapeHtml(exitData.ip)}</b><br>${escapeHtml(exitData.country || '')} ${escapeHtml(exitData.city || '')}`);
                mapLayers.push(marker);
                map.setView([exitData.lat, exitData.lon], 8);
            } else {
                map.setView([20, 0], 2);
            }
        }, 100);
    }
}

function renderResults() {
    if (!resultRecords.length) {
        if (resultsDiv) resultsDiv.innerHTML = '';
        if (resultsEmpty) resultsEmpty.style.display = 'grid';
        if (resultsFilters) resultsFilters.hidden = true;
        return;
    }
    if (resultsEmpty) resultsEmpty.style.display = 'none';
    if (resultsFilters) resultsFilters.hidden = false;
    
    let filtered = resultRecords;
    if (activeStatusFilter !== 'all') {
        filtered = filtered.filter(r => r.status === activeStatusFilter);
    }
    if (activeProtocolFilters.length) {
        filtered = filtered.filter(r => activeProtocolFilters.includes(r.type));
    }
    
    if (!filtered.length) {
        if (filterEmpty) filterEmpty.hidden = false;
        if (resultsDiv) resultsDiv.innerHTML = '';
    } else {
        if (filterEmpty) filterEmpty.hidden = true;
        if (resultsDiv) {
            resultsDiv.innerHTML = filtered.map(record => {
                const statusClass = record.status === 'success' ? 'success' : (record.status === 'error' ? 'error' : '');
                const isSuccess = record.status === 'success';
                const isError = record.status === 'error';
                const isPending = record.status === 'pending';
                
                let statusBadgeClass = '';
                let statusText = '';
                if (isSuccess) {
                    statusBadgeClass = 'status-success';
                    statusText = '可用';
                } else if (isError) {
                    statusBadgeClass = 'status-error';
                    statusText = '不可用';
                } else {
                    statusBadgeClass = 'status-pending';
                    statusText = '检测中';
                }
                
                const typeDisplay = record.type ? record.type.toUpperCase() : 'SOCKS5';
                const latencyText = record.responseTime ? `${record.responseTime}ms` : '';
                
                // 构建位置字符串（国家 · 省份 · 城市）
                let locationText = '未知位置';
                if (isSuccess && record.exit) {
                    const locationParts = [];
                    if (record.exit.country) locationParts.push(record.exit.country);
                    if (record.exit.region && record.exit.region !== record.exit.country) locationParts.push(record.exit.region);
                    if (record.exit.city && record.exit.city !== record.exit.region) locationParts.push(record.exit.city);
                    locationText = locationParts.join(' · ') || '未知位置';
                }
                
                const networkText = (isSuccess && record.exit) ? (record.exit.isp || record.exit.org || '未知运营商') : '';
                
                // 构建 meta chips
                let metaHtml = '';
                if (isSuccess && record.exit) {
                    metaHtml = `
                        <div class="result-meta">
                            ${buildMetaChip(locationText, 'location')}
                            ${buildMetaChip(networkText, 'network')}
                            ${buildMetaChip(typeDisplay, 'info', 'meta-chip-strong')}
                            ${latencyText ? buildMetaChip(latencyText, 'prep') : ''}
                        </div>
                    `;
                } else if (isError && record.error) {
                    metaHtml = `
                        <div class="result-meta">
                            ${buildMetaChip('检测失败', 'error', 'meta-chip-danger')}
                            ${buildMetaChip(record.error.substring(0, 50), 'info')}
                        </div>
                    `;
                }
                
                // 构建 exit list
                let exitHtml = '';
                if (isSuccess && record.exitIps && record.exitIps.length) {
                    exitHtml = `
                        <div class="exit-list">
                            <span class="exit-list-label">落地 IP</span>
                            ${record.exitIps.map(exit => `
                                <button class="exit-ip-btn" data-exit-ip="${escapeHtml(exit.ip)}" data-exit-data='${JSON.stringify(exit)}'>
                                    ${escapeHtml(exit.ip)}
                                </button>
                            `).join('')}
                        </div>
                        <div class="map-container-wrapper" style="display: none;">
                            <div class="map-detail-map-panel">
                                <div class="map-detail-map-slot"></div>
                            </div>
                            <div class="exit-detail-grid">
                                <div class="exit-detail-card exit-basic-info-card"></div>
                                <div class="exit-detail-card exit-security-info-card"></div>
                            </div>
                        </div>
                    `;
                }
                
                return `<div class="result-item ${statusClass} ${record.exit && record.exit.flag ? 'has-flag' : ''}">
                    <div class="result-flag-overlay" aria-hidden="true" style="${record.exit && record.exit.flag ? `background-image: url('${record.exit.flag}');` : ''}"></div>
                    <div class="result-top">
                        <div class="result-info">
                            <span class="result-label">候选目标</span>
                            <button class="result-ip copy-target" data-copy-target="${escapeHtml(record.link || record.candidate)}" title="点击复制候选目标">
                                ${escapeHtml(record.link || record.candidate)}
                            </button>
                            <span class="result-detail">${isSuccess ? '代理验证通过，可继续查看出口位置和网络信息。' : (isPending ? '已加入检测队列，正在等待返回结果。' : '无法通过该代理访问目标服务器，请更换目标后重试。')}</span>
                        </div>
                        <span class="status-badge ${statusBadgeClass}" ${isSuccess && record.responseTime ? `data-tooltip="这个延迟不是你到代理的延迟，而是 Cloudflare 机房到代理的检测延迟。"` : ''}>${isSuccess ? latencyText : statusText}</span>
                    </div>
                    ${metaHtml}
                    ${exitHtml}
                </div>`;
            }).join('');
        }
    }
    
    // 绑定复制按钮事件
    document.querySelectorAll('.copy-target').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const text = btn.dataset.copyTarget || btn.innerText;
            try {
                await navigator.clipboard.writeText(text);
                showToast('已复制候选目标：' + text);
            } catch (err) {
                console.error('复制失败', err);
            }
        });
    });
    
    // 绑定出口 IP 按钮事件
    document.querySelectorAll('.exit-ip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const exitData = JSON.parse(btn.dataset.exitData || '{}');
            showDetails(btn, exitData);
        });
    });
    
    updateStats();
    updateFilterChips();
}

// 构建 meta chip 辅助函数
function buildMetaChip(text, iconName, modifierClass) {
    const icons = {
        prep: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path></svg>',
        location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-4.35 6-10a6 6 0 1 0-12 0c0 5.65 6 10 6 10z"></path><circle cx="12" cy="11" r="2.5"></circle></svg>',
        network: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="6" rx="2"></rect><rect x="3" y="14" width="18" height="6" rx="2"></rect><circle cx="7" cy="7" r="1"></circle><circle cx="7" cy="17" r="1"></circle><path d="M12 10v4"></path></svg>',
        shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3.4 8.74-7 10-3.6-1.26-7-5-7-10V6l7-3z"></path><path d="m9.5 12 1.7 1.7 3.3-3.7"></path></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 10v5"></path><circle cx="12" cy="7" r="1"></circle></svg>'
    };
    const className = modifierClass ? `meta-chip ${modifierClass}` : 'meta-chip';
    return `<span class="${className}">${icons[iconName] || icons.info}<span>${escapeHtml(text)}</span></span>`;
}

// Toast 提示函数
let toastTimer = null;
function showToast(message, isError = false) {
    let toast = document.getElementById('exportToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'exportToast';
        toast.className = 'export-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.className = isError ? 'export-toast is-visible is-error' : 'export-toast is-visible';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('is-visible');
    }, 2000);
}

function updateFilterChips() {
    if (statusFilterGroup) {
        const counts = { all: resultRecords.length, success: 0, error: 0 };
        resultRecords.forEach(r => { if (r.status === 'success') counts.success++; else if (r.status === 'error') counts.error++; });
        statusFilterGroup.innerHTML = STATUS_FILTERS.map(f => `<button class="filter-chip ${activeStatusFilter === f.key ? 'is-active' : ''}" data-status-filter="${f.key}">${f.label}(${counts[f.key] || 0})</button>`).join('');
    }
    if (protocolFilterGroup) {
        const counts = { socks5: 0, http: 0, https: 0 };
        resultRecords.forEach(r => { if (counts[r.type] !== undefined) counts[r.type]++; });
        protocolFilterGroup.innerHTML = PROTOCOL_FILTERS.map(f => `<button class="filter-chip ${activeProtocolFilters.includes(f.key) ? 'is-active' : ''}" data-protocol-filter="${f.key}">${f.label}(${counts[f.key] || 0})</button>`).join('');
    }
    document.querySelectorAll('[data-status-filter]').forEach(btn => {
        btn.addEventListener('click', () => { activeStatusFilter = btn.dataset.statusFilter; updateFilterChips(); renderResults(); });
    });
    document.querySelectorAll('[data-protocol-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.protocolFilter;
            if (activeProtocolFilters.includes(key)) activeProtocolFilters = activeProtocolFilters.filter(k => k !== key);
            else activeProtocolFilters.push(key);
            updateFilterChips(); renderResults();
        });
    });
}

function addResultItem(target) {
    const record = { target, status: 'pending', type: getProxyType(target), completed: false, exitIps: [] };
    resultRecords.push(record);
    renderResults();
    return record;
}

function updateResultRecord(record, data) {
    if (data.success) {
        record.status = 'success';
        record.candidate = data.candidate;
        record.type = data.type;
        record.link = data.link;
        record.responseTime = data.responseTime;
        record.exit = data.exit;
        if (data.exit) record.exitIps = [{ ip: data.exit.ip, ...data.exit }];
    } else {
        record.status = 'error';
        record.error = data.error;
        record.candidate = data.candidate;
        record.type = data.type;
        record.link = data.link;
        record.responseTime = data.responseTime;
    }
    record.completed = true;
    renderResults();
}

function isIpPortFormat(line) {
    return /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/.test(line) || /^\[[0-9a-fA-F:]+\]:\d{1,5}$/.test(line);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function saveCurrentToHistory() {
    const isBatch = batchMode ? batchMode.checked : false;
    let proxy = '';
    if (isBatch && inputBatch) {
        const firstLine = inputBatch.value.split('\n')[0]?.trim();
        if (firstLine) proxy = firstLine;
    } else if (inputSingle) {
        proxy = inputSingle.value.trim();
    }
    if (proxy) saveHistory(proxy);
}

async function startCheck() {
    if (activeRun) {
        activeRun.abort();
        activeRun = null;
        if (checkBtn) { checkBtn.classList.remove('is-stop'); checkBtn.querySelector('span').innerText = '开始检测'; }
        setAppState('stopped', resultRecords.length, resultRecords.filter(r => r.completed).length, resultRecords.filter(r => r.status === 'success').length);
        return;
    }
    
    const proxyList = getProxyList();
    if (!proxyList.length) { alert('请输入代理地址'); return; }
    
    saveCurrentToHistory();
    
    resultRecords = [];
    activeRun = new AbortController();
    if (checkBtn) { checkBtn.classList.add('is-stop'); checkBtn.querySelector('span').innerText = '停止检测'; }
    renderResults();
    setAppState('resolving', 0, 0, 0);
    
    try {
        const resolveJobs = [], targetGroups = [];
        for (const line of proxyList) {
            if (isIpPortFormat(line)) targetGroups.push([line]);
            else { const group = []; resolveJobs.push({ line, group }); targetGroups.push(group); }
        }
        
        if (resolveJobs.length) {
    const batchResults = await resolveBatch(resolveJobs.map(j => j.line), activeRun.signal);
    for (let i = 0; i < batchResults.length; i++) {
        if (batchResults[i].targets && batchResults[i].targets.length) {
            // 获取原始输入，提取协议
            const originalInput = resolveJobs[i].line;
            const protocolMatch = originalInput.match(/^(socks5|http|https):\/\//i);
            const protocol = protocolMatch ? protocolMatch[1].toLowerCase() : 'socks5';
            
            // 为每个解析结果加上协议头
            const targetsWithProtocol = batchResults[i].targets.map(t => `${protocol}://${t}`);
            resolveJobs[i].group.push(...targetsWithProtocol);
        }
    }
}
        
        const allTargets = [];
        for (const group of targetGroups) allTargets.push(...group);
        
        if (!allTargets.length) { setAppState('empty', 0, 0, 0); if (checkBtn) checkBtn.classList.remove('is-stop'); activeRun = null; return; }
        
        setAppState('running', allTargets.length, 0, 0);
        let completed = 0;
        const concurrency = 10;
        
        for (let i = 0; i < allTargets.length; i += concurrency) {
            if (activeRun.signal.aborted) break;
            const batch = allTargets.slice(i, i + concurrency);
            await Promise.all(batch.map(async (target) => {
                const record = addResultItem(target);
                try { updateResultRecord(record, await checkProxy(target, activeRun.signal)); }
                catch (err) { updateResultRecord(record, { success: false, error: err.message }); }
                completed++;
                updateProgress(completed, allTargets.length);
                setAppState('running', allTargets.length, completed, resultRecords.filter(r => r.status === 'success').length);
            }));
        }
        setAppState('done', allTargets.length, completed, resultRecords.filter(r => r.status === 'success').length);
    } catch (err) {
        if (err.name !== 'AbortError') setAppState('error', 0, 0, 0);
    } finally {
        activeRun = null;
        if (checkBtn) { checkBtn.classList.remove('is-stop'); checkBtn.querySelector('span').innerText = '开始检测'; }
    }
}

if (checkBtn) {
    checkBtn.addEventListener('click', startCheck);
}

// ==================== 访问统计 ====================
(function initVisitCount() {
    const visitCountElement = document.getElementById('visit-count');
    if (!visitCountElement) return;

    const hostname = String(window.location.hostname || window.location.host || '').trim().toLowerCase();
    const statsId = hostname || 'unknown-host';

    fetch('https://tongji.090227.xyz/?id=' + encodeURIComponent(statsId))
        .then(function (response) {
            if (!response.ok) throw new Error('Failed to load visit count: ' + response.status);
            return response.json();
        })
        .then(function (data) {
            if (data && data.visitCount !== undefined) {
                visitCountElement.textContent = data.visitCount;
                return;
            }
            throw new Error('visitCount is missing in response');
        })
        .catch(function (error) {
            console.error('Failed to fetch visit count', error);
            visitCountElement.textContent = '加载失败';
        });
})();