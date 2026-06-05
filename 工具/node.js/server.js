// server.js - 完整复刻原版 Worker JS 功能
const express = require('express');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const dns = require('dns').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const CHECK_TIMEOUT = 15000;
const RESOLVE_BATCH_LIMIT = 50;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ==================== 代理解析（复刻原版） ====================

function parseProxyUrl(input) {
    let text = String(input || '').trim();
    
    if (!/^(socks5|http|https):\/\//i.test(text)) {
        text = 'socks5://' + text;
    }
    
    try {
        const url = new URL(text);
        const type = url.protocol.slice(0, -1).toLowerCase();
        
        if (!['socks5', 'http', 'https'].includes(type)) {
            return null;
        }
        
        let hostname = url.hostname;
        let port = url.port;
        
        if (!port) {
            if (type === 'socks5') port = '1080';
            else if (type === 'http') port = '80';
            else port = '443';
        }
        
        if (hostname && hostname.includes(':') && !hostname.startsWith('[')) {
            hostname = `[${hostname}]`;
        }
        
        const auth = url.username ? `${url.username}:${url.password || ''}` : '';
        const normalized = `${type}://${auth ? auth + '@' : ''}${hostname}:${port}`;
        
        return {
            type: type,
            hostname: hostname,
            port: parseInt(port),
            username: url.username || null,
            password: url.password || null,
            normalized: normalized
        };
    } catch (e) {
        return null;
    }
}

function formatProxyAuthority(proxy) {
    const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : '';
    return `${auth}${proxy.hostname}:${proxy.port}`;
}

// ==================== DNS 解析 ====================

async function resolveTarget(input) {
    let text = String(input || '').trim();
    
    text = text.replace(/^(socks5|http|https):\/\//i, '');
    
    if (text.includes('@')) {
        text = text.slice(text.lastIndexOf('@') + 1);
    }
    
    let host = text;
    let port = 443;
    
    if (host.startsWith('[')) {
        const closeIndex = host.indexOf(']');
        if (closeIndex !== -1) {
            const ipv6 = host.slice(1, closeIndex);
            const portPart = host.slice(closeIndex + 1);
            if (portPart.startsWith(':')) {
                port = parseInt(portPart.slice(1)) || 443;
            }
            host = ipv6;
            return [[`[${host}]`, port]];
        }
    }
    
    const colonIndex = host.lastIndexOf(':');
    if (colonIndex !== -1) {
        const maybePort = parseInt(host.slice(colonIndex + 1));
        if (!isNaN(maybePort) && maybePort >= 1 && maybePort <= 65535) {
            port = maybePort;
            host = host.slice(0, colonIndex);
        }
    }
    
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    const isIPv6 = /^[0-9a-f:]+$/i.test(host) && host.includes(':');
    
    if (isIPv4) {
        return [[host, port]];
    }
    if (isIPv6) {
        return [[`[${host}]`, port]];
    }
    
    const results = [];
    try {
        const aRecords = await dns.resolve4(host);
        for (const ip of aRecords) {
            results.push([ip, port]);
        }
    } catch (e) {}
    
    try {
        const aaaaRecords = await dns.resolve6(host);
        for (const ip of aaaaRecords) {
            results.push([`[${ip}]`, port]);
        }
    } catch (e) {}
    
    if (results.length === 0) {
        throw new Error(`无法解析域名: ${host}`);
    }
    
    return results;
}

async function resolveBatch(targets) {
    const results = [];
    for (const target of targets) {
        try {
            const resolved = await resolveTarget(target);
            results.push({
                input: target,
                targets: resolved.map(([ip, port]) => `${ip}:${port}`)
            });
        } catch (e) {
            results.push({ input: target, targets: [], error: e.message });
        }
    }
    return results;
}

// ==================== IP 地理位置（包含省份） ====================

async function getIpLocation(ip) {
    const cleanIp = ip.replace(/[\[\]]/g, '');
    
    // 私有 IP 检查
    const privatePatterns = [
        /^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./,
        /^127\./, /^169\.254\./, /^::1$/, /^fc00:/, /^fe80:/
    ];
    for (const pattern of privatePatterns) {
        if (pattern.test(cleanIp)) {
            return { country: '局域网', region: '本地', city: '本地', isp: '私有地址', flag: null };
        }
    }
    
    try {
        // 添加 region 和 regionName 字段
        const res = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,countryCode,region,regionName,city,isp,org,lat,lon,as,asname`, {
            timeout: 3000
        });
        if (res.data && res.data.status === 'success') {
            const countryCode = res.data.countryCode?.toLowerCase();
            return {
                country: res.data.country,
                countryCode: res.data.countryCode,
                region: res.data.regionName || res.data.region,  // 省份名称
                city: res.data.city,
                isp: res.data.isp,
                org: res.data.org,
                as: res.data.as,
                asname: res.data.asname,
                lat: res.data.lat,
                lon: res.data.lon,
                flag: countryCode ? `https://flagcdn.com/w40/${countryCode}.png` : null
            };
        }
    } catch (e) {
        console.error('IP location error:', e.message);
    }
    return null;
}

// ==================== 代理检测（带多个备用目标） ====================

async function testProxy(proxyInput) {
    const startTime = Date.now();
    
    const proxy = parseProxyUrl(proxyInput);
    if (!proxy) {
        return {
            success: false,
            candidate: proxyInput,
            type: 'unknown',
            link: proxyInput,
            responseTime: Date.now() - startTime,
            error: '代理格式错误，请使用 socks5://host:port 或 host:port'
        };
    }
    
    const proxyUrl = proxy.normalized;
    const candidate = `${proxy.hostname}:${proxy.port}`;
    
    let agent;
    try {
        if (proxy.type === 'socks5') {
            agent = new SocksProxyAgent(proxyUrl);
        } else {
            agent = new HttpsProxyAgent(proxyUrl);
        }
    } catch (e) {
        return {
            success: false,
            candidate: candidate,
            type: proxy.type,
            link: proxyUrl,
            responseTime: Date.now() - startTime,
            error: `创建代理连接失败: ${e.message}`
        };
    }
    
    // 多个备用检测目标
    const testUrls = [
        'http://httpbin.org/ip',
        'http://ip-api.com/json/?fields=query',
        'http://api.ipify.org?format=json',
        'http://myexternalip.com/raw',
        'http://icanhazip.com'
    ];
    
    let lastError = null;
    
    for (const testUrl of testUrls) {
        try {
            const response = await axios.get(testUrl, {
                httpAgent: agent,
                httpsAgent: agent,
                timeout: CHECK_TIMEOUT,
                proxy: false
            });
            
            const elapsed = Date.now() - startTime;
            let exitIp = null;
            
            // 解析不同 API 的响应格式
            if (testUrl.includes('httpbin.org')) {
                exitIp = response.data?.origin;
            } else if (testUrl.includes('ip-api.com')) {
                exitIp = response.data?.query;
            } else if (testUrl.includes('api.ipify.org')) {
                exitIp = response.data?.ip;
            } else if (testUrl.includes('myexternalip.com') || testUrl.includes('icanhazip.com')) {
                exitIp = response.data?.trim();
            }
            
            if (exitIp) {
                if (exitIp.includes(',')) {
                    exitIp = exitIp.split(',')[0].trim();
                }
                
                const location = await getIpLocation(exitIp);
                
                return {
                    success: true,
                    candidate: candidate,
                    type: proxy.type,
                    username: proxy.username,
                    password: proxy.password,
                    hostname: proxy.hostname,
                    port: proxy.port,
                    link: proxyUrl,
                    responseTime: elapsed,
                    tested_with: testUrl,
                    exit: {
                        ip: exitIp,
                        country: location?.country || null,
                        countryCode: location?.countryCode || null,
                        region: location?.region || null,
                        city: location?.city || null,
                        isp: location?.isp || null,
                        org: location?.org || null,
                        as: location?.as || null,
                        asname: location?.asname || null,
                        lat: location?.lat || null,
                        lon: location?.lon || null,
                        flag: location?.flag || null
                    }
                };
            }
        } catch (error) {
            lastError = error;
            // 继续尝试下一个备用 API
            continue;
        }
    }
    
    // 所有备用 API 都失败了
    const elapsed = Date.now() - startTime;
    let errorMsg = '所有检测目标均失败';
    
    if (lastError) {
        if (lastError.code === 'ECONNREFUSED') errorMsg = '无法连接到代理服务器';
        else if (lastError.code === 'ETIMEDOUT') errorMsg = '连接超时';
        else if (lastError.code === 'ENOTFOUND') errorMsg = '无法解析代理地址';
        else if (lastError.response?.status === 503) errorMsg = '检测服务暂时不可用，请稍后重试';
        else if (lastError.response) errorMsg = `HTTP ${lastError.response.status}`;
        else if (lastError.message) errorMsg = lastError.message;
    }
    
    return {
        success: false,
        candidate: candidate,
        type: proxy.type,
        link: proxyUrl,
        responseTime: elapsed,
        error: errorMsg
    };
}

// ==================== API 路由 ====================

app.get('/api/ip.json', async (req, res) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
    const location = await getIpLocation(ip);
    res.json({
        ip: ip,
        ipType: ip?.includes(':') ? 'ipv6' : 'ipv4',
        country: location?.country,
        region: location?.region,
        city: location?.city,
        time: new Date().toISOString()
    });
});

app.get('/api/resolve', async (req, res) => {
    const target = req.query.proxyip || req.query.target || req.query.host;
    if (!target) {
        return res.status(400).json({ error: 'Missing proxyip' });
    }
    try {
        const results = await resolveTarget(target);
        res.json(results.map(([ip, port]) => `${ip}:${port}`));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/resolve-batch', async (req, res) => {
    const targets = req.body.targets || [];
    if (!targets.length) {
        return res.status(400).json({ error: 'Missing targets' });
    }
    if (targets.length > RESOLVE_BATCH_LIMIT) {
        return res.status(400).json({ error: `Batch limit is ${RESOLVE_BATCH_LIMIT}` });
    }
    const results = await resolveBatch(targets);
    res.json({ results });
});

app.get('/api/check', async (req, res) => {
    const proxy = req.query.proxy || req.query.socks5 || req.query.http;
    if (!proxy) {
        return res.status(400).json({ success: false, error: 'Missing proxy' });
    }
    const result = await testProxy(proxy);
    res.json(result);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});