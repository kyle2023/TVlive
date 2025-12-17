<?php
/**
 * PHP代理后端（增强版）
 * - 支持 SOCKS5
 * - 支持 hosts 绑定（等价系统 hosts）
 * - 支持重定向后域名继续命中 hosts
 * - 保证 headers 永远可统计
 * - 支持大文件下载
 * - 大文件（>2MB）和流媒体不获取响应体
 * - 非流媒体响应超过2000字符提供下载
 * - 修复JSON响应中断问题
 * - 增强错误处理
 */

// 设置严格的错误报告和输出缓冲
ob_start(); // 开启输出缓冲，防止意外的输出污染JSON

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS, HEAD');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// 增加限制，避免超时和内存问题
set_time_limit(120); // 增加到120秒
ini_set('max_execution_time', 120);
ini_set('memory_limit', '256M'); // 增加内存限制
error_reporting(0);
ini_set('display_errors', 0);

// 简单的请求日志（用于调试）
function logRequest($message, $data = null) {
    $logDir = __DIR__ . '/logs';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    
    $logFile = $logDir . '/proxy_debug.log';
    $timestamp = date('Y-m-d H:i:s');
    $logMessage = "[$timestamp] $message";
    
    if ($data !== null) {
        $logMessage .= " - " . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    
    $logMessage .= "\n";
    
    @file_put_contents($logFile, $logMessage, FILE_APPEND);
}

// 清理输出并返回错误
function returnError($message, $code = 500) {
    ob_end_clean();
    http_response_code($code);
    
    $errorResponse = [
        'error' => $message,
        'url' => '',
        'final_url' => '',
        'status_code' => $code,
        'headers' => [],
        'body' => '',
        'size' => 0,
        'time' => 0,
        'redirect_count' => 0,
        'redirects' => []
    ];
    
    logRequest("ERROR: $message", ['code' => $code]);
    
    echo json_encode($errorResponse, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// 处理下载请求
if (isset($_GET['download'])) {
    try {
        ob_end_clean(); // 清理输出缓冲
        
        // 从缓存文件读取响应数据
        $cacheFile = preg_replace('/[^a-f0-9]/', '', $_GET['download']); // 安全过滤
        $cachePath = sys_get_temp_dir() . '/proxy_cache_' . $cacheFile . '.json';
        
        if (file_exists($cachePath) && filesize($cachePath) > 0) {
            $cacheData = json_decode(file_get_contents($cachePath), true);
            
            if ($cacheData && isset($cacheData['body'])) {
                // 设置下载头
                $filename = 'downloaded_file';
                
                // 根据内容类型设置文件名和Content-Type
                if (isset($cacheData['headers']['content-type'])) {
                    $contentType = $cacheData['headers']['content-type'];
                    header('Content-Type: ' . $contentType);
                    
                    // 提取可能的文件扩展名
                    if (strpos($contentType, 'video/') !== false) {
                        $ext = explode('/', $contentType)[1];
                        $filename = 'video.' . ($ext === 'x-mpegurl' ? 'm3u8' : $ext);
                    } elseif (strpos($contentType, 'audio/') !== false) {
                        $ext = explode('/', $contentType)[1];
                        $filename = 'audio.' . $ext;
                    } elseif (strpos($contentType, 'application/x-mpegurl') !== false ||
                              strpos($contentType, 'application/vnd.apple.mpegurl') !== false) {
                        $filename = 'playlist.m3u8';
                        header('Content-Type: application/vnd.apple.mpegurl');
                    } elseif (strpos($contentType, 'application/json') !== false) {
                        $filename = 'response.json';
                    } elseif (strpos($contentType, 'text/html') !== false) {
                        $filename = 'response.html';
                    } elseif (strpos($contentType, 'text/plain') !== false) {
                        $filename = 'response.txt';
                    }
                }
                
                // 设置下载头
                header('Content-Disposition: attachment; filename="' . $filename . '"');
                header('Content-Length: ' . strlen($cacheData['body']));
                
                // 输出完整响应体
                echo $cacheData['body'];
                
                // 删除缓存文件
                @unlink($cachePath);
                exit;
            }
        }
        
        // 如果缓存文件不存在或无效
        returnError('下载链接已过期或无效', 404);
        
    } catch (Exception $e) {
        returnError('下载处理失败: ' . $e->getMessage(), 500);
    }
}

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS' || $_SERVER['REQUEST_METHOD'] === 'HEAD') {
    ob_end_clean();
    http_response_code(200);
    exit;
}

// 只允许POST请求
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    returnError('只允许POST请求', 405);
}

// 读取并解析请求数据
try {
    $input = file_get_contents('php://input');
    
    if (empty($input)) {
        returnError('请求数据为空', 400);
    }
    
    $data = json_decode($input, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        returnError('JSON解析失败: ' . json_last_error_msg(), 400);
    }
    
    if (!$data || empty($data['url'])) {
        returnError('无效的请求数据: URL不能为空', 400);
    }
    
} catch (Exception $e) {
    returnError('请求数据读取失败: ' . $e->getMessage(), 400);
}

/* ========= hosts 解析（新增） ========= */
function parseHostsMap($text) {
    $map = [];
    foreach (preg_split('/\r?\n/', $text) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;

        $p = preg_split('/\s+/', $line);
        if (count($p) === 2) {
            if (filter_var($p[0], FILTER_VALIDATE_IP)) {
                $map[$p[1]] = $p[0];
            } elseif (filter_var($p[1], FILTER_VALIDATE_IP)) {
                $map[$p[0]] = $p[1];
            }
        }
    }
    return $map;
}

$hostsMap = parseHostsMap($data['host'] ?? '');

/* ========= 参数 ========= */
$url              = $data['url'];
$method           = strtoupper($data['method'] ?? 'GET');
$timeout          = max(1, min(120, (int)($data['timeout'] ?? 30)));
$proxy_address    = trim($data['proxy'] ?? '');
$proxy_username   = trim($data['proxy_username'] ?? '');
$proxy_password   = trim($data['proxy_password'] ?? '');
$follow_redirects = (bool)($data['follow_redirects'] ?? true);
$max_redirects    = max(0, min(50, (int)($data['max_redirects'] ?? 10)));
$request_headers  = (array)($data['headers'] ?? []);

// 记录请求信息
logRequest("收到请求", [
    'url' => $url,
    'method' => $method,
    'timeout' => $timeout,
    'has_proxy' => !empty($proxy_address)
]);

// 执行请求并捕获可能的中断
try {
    $result = executeRequest(
        $url,
        $method,
        $request_headers,
        $hostsMap,
        $timeout,
        $proxy_address,
        $proxy_username,
        $proxy_password,
        $follow_redirects,
        $max_redirects
    );
    
    // 确保结果是数组
    if (!is_array($result)) {
        $result = [
            'url' => $url,
            'final_url' => $url,
            'status_code' => 500,
            'headers' => [],
            'body' => '后端处理错误：返回结果不是有效的数组',
            'size' => 0,
            'time' => 0,
            'redirect_count' => 0,
            'redirects' => []
        ];
    }
    
    // 检查是否为媒体文件或大文件
    $isMediaFile = false;
    $isLargeFile = false;
    $contentType = isset($result['headers']['content-type']) ? strtolower($result['headers']['content-type']) : '';
    $urlPath = parse_url($url, PHP_URL_PATH);
    $finalUrlPath = parse_url($result['final_url'] ?? $url, PHP_URL_PATH);
    
    // 媒体文件扩展名列表（移除了M3U8/M3U）
    $mediaExtensions = [
        // 视频格式
        '.flv', '.mp4', '.m4v', '.mov', '.avi', '.wmv', '.mkv', '.webm', '.ts', '.mts', '.m2ts',
        '.3gp', '.3g2', '.f4v', '.vob', '.ogv', '.divx',
        // 音频格式
        '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.wma',
        // 流媒体格式（移除了.m3u8, .m3u）
        '.mpd'
    ];
    
    // 通过URL后缀检测媒体文件
    function isMediaUrl($url) {
        global $mediaExtensions;
        $urlPath = parse_url($url, PHP_URL_PATH);
        if (!$urlPath) return false;
        
        $lowerPath = strtolower($urlPath);
        foreach ($mediaExtensions as $ext) {
            if (strlen($lowerPath) >= strlen($ext) && substr($lowerPath, -strlen($ext)) === $ext) {
                return true;
            }
        }
        return false;
    }
    
    // 通过Content-Type检测媒体文件（排除M3U8）
    function isMediaContentType($contentType) {
        // 排除M3U8相关的Content-Type
        $m3u8Types = [
            'application/x-mpegurl',
            'application/vnd.apple.mpegurl',
            'audio/x-mpegurl'
        ];
        
        foreach ($m3u8Types as $m3u8Type) {
            if (strpos($contentType, $m3u8Type) !== false) {
                return false; // M3U8文件不视为媒体文件
            }
        }
        
        return strpos($contentType, 'video/') === 0 || 
               strpos($contentType, 'audio/') === 0;
    }
    
    // 检测是否为M3U8文件
    function isM3U8File($url, $contentType) {
        // 检查URL后缀
        $urlPath = parse_url($url, PHP_URL_PATH);
        if ($urlPath) {
            $lowerPath = strtolower($urlPath);
            if (substr($lowerPath, -5) === '.m3u8' || substr($lowerPath, -4) === '.m3u') {
                return true;
            }
        }
        
        // 检查Content-Type
        $m3u8Types = [
            'application/x-mpegurl',
            'application/vnd.apple.mpegurl',
            'audio/x-mpegurl'
        ];
        
        foreach ($m3u8Types as $m3u8Type) {
            if (strpos($contentType, $m3u8Type) !== false) {
                return true;
            }
        }
        
        // 检查响应体是否以#EXTM3U开头
        global $result;
        if (isset($result['body']) && strpos(trim($result['body']), '#EXTM3U') === 0) {
            return true;
        }
        
        return false;
    }
    
    // 检测是否为M3U8文件
    $isM3U8 = isM3U8File($result['final_url'] ?? $url, $contentType);
    
    // 检测是否为媒体文件（排除M3U8）
    $isMediaByUrl = isMediaUrl($url) || isMediaUrl($result['final_url'] ?? $url);
    $isMediaByContent = isMediaContentType($contentType);
    $isMediaFile = ($isMediaByUrl || $isMediaByContent) && !$isM3U8;
    
    // 检测是否为大文件（>2MB）
    $contentLength = isset($result['headers']['content-length']) ? intval($result['headers']['content-length']) : 0;
    $bodySize = isset($result['body']) ? strlen($result['body']) : 0;
    
    if ($contentLength > 2 * 1024 * 1024) { // 2MB
        $isLargeFile = true;
    } elseif ($bodySize > 2 * 1024 * 1024) {
        $isLargeFile = true;
    }
    
    // 处理大文件或媒体文件：不获取响应体
    if (($isLargeFile || $isMediaFile) && !$isM3U8) {
        // 只显示基本信息，不显示内容体
        $result['body'] = '[文件信息]' . "\n\n";
        $result['body'] .= '文件类型: ' . ($isMediaFile ? '媒体文件' : '大文件') . "\n";
        $result['body'] .= '内容类型: ' . ($contentType ?: '未指定') . "\n";
        
        if ($contentLength > 0) {
            $result['body'] .= '文件大小: ' . formatBytes($contentLength) . "\n";
        } elseif (isset($result['size'])) {
            $result['body'] .= '响应大小: ' . formatBytes($result['size']) . "\n";
        }
        
        if (isset($result['final_url'])) {
            $result['body'] .= '最终URL: ' . $result['final_url'] . "\n";
        }
        
        $result['body'] .= "\n" . '提示: 此文件为' . ($isMediaFile ? '媒体文件' : '大文件') . '，为节省资源不获取完整响应体。';
        
        $result['skip_body'] = true;
        $result['file_type'] = $isMediaFile ? 'media' : 'large_file';
        $result['download_available'] = false;
    } else {
        // 对于M3U8文件，总是显示完整内容，不截断
        if ($isM3U8) {
            $result['download_url'] = null;
            $result['truncated'] = false;
            $result['download_available'] = false;
            
            // 如果M3U8文件很大，提供下载选项
            if ($bodySize > 2000) {
                $cacheId = md5(uniqid() . $url . microtime(true));
                $cachePath = sys_get_temp_dir() . '/proxy_cache_' . $cacheId . '.json';
                
                if (file_put_contents($cachePath, json_encode([
                    'body' => $result['body'],
                    'headers' => $result['headers']
                ]))) {
                    $result['download_url'] = 'proxy.php?download=' . $cacheId;
                    $result['download_available'] = true;
                    cleanupOldCacheFiles(300);
                }
            }
        } else {
            // 对于普通文本响应，超过2000字符提供下载
            if ($bodySize > 2000) {
                // 生成唯一缓存文件 ID
                $cacheId = md5(uniqid() . $url . microtime(true));
                $cachePath = sys_get_temp_dir() . '/proxy_cache_' . $cacheId . '.json';
                
                // 保存完整响应到缓存文件
                if (file_put_contents($cachePath, json_encode([
                    'body' => $result['body'],
                    'headers' => $result['headers']
                ]))) {
                    $result['download_url'] = 'proxy.php?download=' . $cacheId;
                    $result['body'] = substr($result['body'], 0, 2000) . "\n\n... (响应体超过2000字符，已截断前2000字符，请下载完整文件查看) ...";
                    $result['truncated'] = true;
                    $result['download_available'] = true;
                    
                    // 清理旧缓存文件（超过5分钟）
                    cleanupOldCacheFiles(300);
                } else {
                    $result['body'] = substr($result['body'], 0, 2000) . "\n\n... (响应体超过2000字符，已截断前2000字符，但无法生成下载链接) ...";
                    $result['truncated'] = true;
                    $result['download_available'] = false;
                }
            } else {
                $result['download_url'] = null;
                $result['truncated'] = false;
                $result['download_available'] = false;
            }
        }
    }
    
    // 标记是否为M3U8文件
    $result['is_m3u8'] = $isM3U8;
    
    // 确保所有必要的字段都存在
    $result = array_merge([
        'url' => $url,
        'final_url' => $url,
        'status_code' => 0,
        'headers' => [],
        'body' => '',
        'size' => 0,
        'time' => 0,
        'redirect_count' => 0,
        'redirects' => [],
        'download_url' => null,
        'truncated' => false,
        'download_available' => false,
        'skip_body' => false,
        'file_type' => '',
        'is_m3u8' => false
    ], $result);
    
    // 记录成功响应
    logRequest("请求成功", [
        'url' => $url,
        'status' => $result['status_code'],
        'size' => $result['size'],
        'time' => $result['time'],
        'is_m3u8' => $result['is_m3u8'],
        'body_size' => strlen($result['body'])
    ]);
    
    // 清除输出缓冲并发送JSON响应
    ob_end_clean();
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    
} catch (Exception $e) {
    // 捕获异常，返回错误信息
    returnError('服务器处理错误: ' . $e->getMessage(), 500);
}

// 清理旧缓存文件
function cleanupOldCacheFiles($maxAge = 300) {
    try {
        $tempDir = sys_get_temp_dir();
        $files = glob($tempDir . '/proxy_cache_*.json');
        $now = time();
        
        foreach ($files as $file) {
            if (filemtime($file) < $now - $maxAge) {
                @unlink($file);
            }
        }
    } catch (Exception $e) {
        // 忽略清理错误
    }
}

// 格式化字节数
function formatBytes($bytes) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    
    return round($bytes, 2) . ' ' . $units[$pow];
}

/* ======================================================= */

function executeRequest($url, $method, $request_headers, $hostsMap, $timeout, $proxy_address, $proxy_username, $proxy_password, $follow_redirects, $max_redirects) {
    $redirects = [];
    $redirect_count = 0;
    $current_url = $url;

    $final_headers = [];
    $final_body = '';
    $final_status = 0;
    $final_time = 0;

    while (true) {
        $parsed = parse_url($current_url);
        if (!$parsed || !isset($parsed['scheme']) || !isset($parsed['host'])) {
            return [
                'url' => $url,
                'final_url' => $current_url,
                'status_code' => 400,
                'headers' => [],
                'body' => '无效的URL格式: ' . $current_url,
                'size' => 0,
                'time' => 0,
                'redirect_count' => $redirect_count,
                'redirects' => $redirects
            ];
        }

        $scheme = $parsed['scheme'];
        $host   = $parsed['host'];
        $port   = $parsed['port'] ?? ($scheme === 'https' ? 443 : 80);
        $path   = ($parsed['path'] ?? '/') . (isset($parsed['query']) ? '?' . $parsed['query'] : '');

        // 检查是否为媒体文件（通过URL后缀）
        $isMediaUrl = false;
        $urlPath = $parsed['path'] ?? '';
        
        // 媒体文件扩展名列表（不包括M3U8，因为我们想要获取M3U8的内容）
        $mediaExtensions = ['.flv', '.mp4', '.ts', '.avi', '.mkv', '.mov', '.wmv', '.webm'];
        
        if ($urlPath) {
            $lowerPath = strtolower($urlPath);
            foreach ($mediaExtensions as $ext) {
                if (strlen($lowerPath) >= strlen($ext) && substr($lowerPath, -strlen($ext)) === $ext) {
                    $isMediaUrl = true;
                    break;
                }
            }
        }

        // 关键修复：每次请求都检查当前域名是否在 Hosts 映射中
        $target_ip = $hostsMap[$host] ?? null;
        $request_url = $current_url;

        $ch = curl_init();

        if ($target_ip) {
            $request_url = "{$scheme}://{$target_ip}:{$port}{$path}";
            curl_setopt($ch, CURLOPT_RESOLVE, ["{$host}:{$port}:{$target_ip}"]);
        }

        // 对于媒体文件，使用HEAD请求只获取头部
        $curlOptions = [
            CURLOPT_URL => $request_url,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_FRESH_CONNECT => true,
            CURLOPT_ENCODING => '', // 自动处理压缩
            CURLOPT_USERAGENT => $request_headers['User-Agent'] ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ];
        
        // 对于媒体文件，使用HEAD请求只获取头部
        if ($isMediaUrl) {
            $curlOptions[CURLOPT_NOBODY] = true;
            $curlOptions[CURLOPT_CUSTOMREQUEST] = 'HEAD';
        }

        curl_setopt_array($ch, $curlOptions);

        // ==================== 修改：支持带认证的SOCKS5代理 ====================
        if ($proxy_address) {
            curl_setopt($ch, CURLOPT_PROXYTYPE, CURLPROXY_SOCKS5);
            curl_setopt($ch, CURLOPT_PROXY, $proxy_address);
            curl_setopt($ch, CURLOPT_IPRESOLVE, CURL_IPRESOLVE_V4);
            
            // 如果提供了用户名和密码，则设置代理认证
            if (!empty($proxy_username) && !empty($proxy_password)) {
                curl_setopt($ch, CURLOPT_PROXYUSERPWD, $proxy_username . ':' . $proxy_password);
            }
        }

        $headers_array = ["Host: {$host}", "Connection: close"];
        foreach ($request_headers as $k => $v) {
            if (!in_array(strtolower($k), ['host', 'connection'])) {
                $headers_array[] = "{$k}: {$v}";
            }
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers_array);

        $resp = curl_exec($ch);
        $info = curl_getinfo($ch);
        $error = curl_error($ch);
        curl_close($ch);

        // 处理请求响应
        $headers = [];
        $body = '';
        
        if ($resp === false) {
            // 请求失败（如超时）
            $status_code = 504;
            $body = $error;
            $header_str = '';
            
            // 记录CURL错误
            logRequest("CURL请求失败", [
                'url' => $request_url,
                'error' => $error
            ]);
        } else {
            // 请求成功
            $header_size = $info['header_size'];
            $header_str = substr($resp, 0, $header_size);
            
            // 对于媒体文件，body应该是空的（因为使用了HEAD请求）
            // 对于其他文件，获取完整的body
            $body = $isMediaUrl ? '' : substr($resp, $header_size);
            
            $headers = parseHeaders($header_str);
            $status_code = $info['http_code'];
        }
        
        // 总是记录请求到重定向链（无论成功还是失败）
        $redirects[] = [
            'url' => $current_url,
            'status_code' => $status_code,
            'response_headers' => $headers,
            'time' => $info['total_time']
        ];

        // 如果是失败的请求，直接返回
        if ($resp === false) {
            return [
                'url' => $url,
                'final_url' => $current_url,
                'status_code' => $status_code,
                'headers' => $headers,
                'body' => $body,
                'size' => strlen($body),
                'time' => $info['total_time'],
                'redirect_count' => $redirect_count,
                'redirects' => $redirects
            ];
        }

        // 保存最终响应信息
        $final_headers = $headers;
        $final_body = $body;
        $final_status = $status_code;
        $final_time = $info['total_time'];

        // 检查是否需要继续重定向
        if (
            $follow_redirects &&
            $final_status >= 300 &&
            $final_status < 400 &&
            isset($headers['location']) &&
            $redirect_count < $max_redirects
        ) {
            $new_url = is_absolute_url($headers['location'])
                ? $headers['location']
                : resolve_relative_url($current_url, $headers['location']);
            
            // 重要：更新当前 URL 并继续循环
            $current_url = $new_url;
            $redirect_count++;
            continue;
        }

        // 不需要重定向，跳出循环
        break;
    }

    return [
        'url' => $url,
        'final_url' => $current_url,
        'status_code' => $final_status,
        'headers' => $final_headers ?: [],
        'body' => $final_body,
        'size' => strlen($final_body),
        'time' => $final_time,
        'redirect_count' => $redirect_count,
        'redirects' => $redirects
    ];
}

/* ========= 工具函数（修复大小写敏感问题） ========= */

function is_absolute_url($url) {
    return preg_match('/^https?:\/\//i', $url);
}

function resolve_relative_url($base_url, $relative_url) {
    $base = parse_url($base_url);
    if (is_absolute_url($relative_url)) return $relative_url;
    if (strpos($relative_url, '//') === 0) return $base['scheme'] . ':' . $relative_url;
    if ($relative_url[0] === '/') {
        return $base['scheme'] . '://' . $base['host'] . (isset($base['port']) ? ':' . $base['port'] : '') . $relative_url;
    }
    $path = rtrim(dirname($base['path'] ?? '/'), '/') . '/' . $relative_url;
    return $base['scheme'] . '://' . $base['host'] . (isset($base['port']) ? ':' . $base['port'] : '') . $path;
}

function parseHeaders($header_str) {
    $headers = [];
    foreach (explode("\r\n", $header_str) as $line) {
        if (strpos($line, ':') !== false) {
            [$k, $v] = explode(':', $line, 2);
            // 修复：将 header 名转换为小写，避免大小写问题
            $headers[strtolower(trim($k))] = trim($v);
        }
    }
    return $headers;
}