# Proxy Checker Node.js

一个基于 Node.js 的代理检测服务，参考 **CF-Workers-CheckSocks5** 的 API 设计与检测逻辑实现。

相比原版运行在 Cloudflare Workers 环境，本项目部署在自己的服务器、VPS 或 NAS 上，检测结果更贴近真实网络环境，特别适合 IPTV、代理节点、网络测试等场景。

## ✨ 特性

- ✅ SOCKS5 代理检测
- ✅ HTTP / HTTPS 代理检测
- ✅ 用户名密码认证支持
- ✅ 出口 IP 查询
- ✅ 国家、城市、ISP 信息展示
- ✅ Leaflet 地图定位
- ✅ IPv4 / IPv6 域名解析
- ✅ 批量检测
- ✅ 历史记录保存
- ✅ 深色 / 浅色主题
- ✅ REST API
- ✅ VPS、NAS、1Panel 部署

## 🔄 与原版区别

本项目参考自：

**CF-Workers-CheckSocks5**

主要差异如下：

| 功能 | CF Workers版 | Node.js版 |
|--------|--------|--------|
| 运行环境 | Cloudflare Workers | Node.js |
| SOCKS5 | ✅ | ✅ |
| HTTP/HTTPS | ✅ | ✅ |
| TURN | ✅ | ❌ |
| SSTP | ✅ | ❌ |
| 批量检测 | ✅ | ✅ |
| 域名解析 | ✅ | ✅ |


> 当前版本专注于 SOCKS5、HTTP、HTTPS 代理检测，未移植 TURN 和 SSTP 协议支持。



---

## 🚀 快速部署

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装

cd proxy-checker-node

npm install
```

### 启动

```bash
node server.js
```

或使用 PM2：

```bash
pm2 start server.js --name proxy-checker
```

默认监听端口：

```text
3000
```

访问：

```text
http://服务器IP:3000
```

---

## 🖥️ 1Panel 部署

### 创建 Node 项目

进入：

```text
网站
→ Node项目
→ 创建项目
```

填写：

| 项目 | 示例 |
|--------|--------|
| 项目目录 | /opt/proxy-checker |
| 启动命令 | node server.js |
| 监听端口 | 3000 |

### 配置反向代理

创建网站：

```text
proxy.example.com
```

反向代理到：

```text
http://127.0.0.1:3000
```

即可通过域名访问。

---

## 📖 使用方法

### 单个代理检测

支持：

```text
socks5://1.2.3.4:1080

http://1.2.3.4:8080

https://1.2.3.4:443
```

支持认证：

```text
socks5://user:pass@1.2.3.4:1080
```

### 批量检测

开启批量模式后：

```text
proxy1
proxy2
proxy3
```

每行一个目标即可。

---

## 🔌 API

### 检测代理

```http
GET /api/check?proxy=<proxy>
```

示例：

```http
/api/check?proxy=socks5://1.2.3.4:1080
```

### 域名解析

```http
GET /api/resolve?proxyip=<target>
```

示例：

```http
/api/resolve?proxyip=proxy.example.com:1080
```

### 批量解析

```http
POST /api/resolve-batch
```

请求示例：

```json
{
  "targets": [
    "proxy-a.example.com:1080",
    "proxy-b.example.com:1080"
  ]
}
```

### 获取当前 IP

```http
GET /api/ip.json
```

---

## ⚠️ 注意事项

### 默认协议

如果输入：

```text
1.2.3.4:1080
```

系统默认按：

```text
socks5://1.2.3.4:1080
```

处理。

### IP 定位限制

项目默认使用：

```text
ip-api.com
```

免费接口存在访问频率限制。

如需高频使用，建议替换为自建或商业 GeoIP 服务。

### 公网部署

本项目默认不包含鉴权机制。

如果直接暴露到公网，建议配置：

- Nginx Basic Auth
- Cloudflare Access
- IP 白名单
- 内网访问

避免接口被滥用。

---

## 🙏 致谢

- CF-Workers-CheckSocks5
- ip-api.com
- Leaflet
- OpenStreetMap

---

## 📄 License

GPL-3.0 License