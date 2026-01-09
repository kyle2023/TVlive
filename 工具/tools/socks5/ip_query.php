<?php
/**
 * IP归属地查询模块
 * 支持缓存机制，减少API调用
 */

// 缓存目录
define('CACHE_DIR', __DIR__ . '/cache/');
define('CACHE_EXPIRE', 3600 * 24 * 30); // 缓存30天

// 确保缓存目录存在
if (!file_exists(CACHE_DIR)) {
    mkdir(CACHE_DIR, 0755, true);
}

/**
 * 获取缓存文件名（使用IP格式：112_12_23_32）
 */
function getCacheFilename($ip) {
    // 替换点号为下划线
    $safeFilename = str_replace('.', '_', $ip);
    return CACHE_DIR . $safeFilename . '.json';
}

/**
 * 查询IP归属地信息
 * @param string $ip IP地址
 * @return array IP信息
 */
function queryIPInfo($ip) {
    // 验证IP格式
    if (!filter_var($ip, FILTER_VALIDATE_IP)) {
        return [
            'success' => false,
            'error' => '无效的IP地址'
        ];
    }
    
    // 检查缓存
    $cacheFile = getCacheFilename($ip);
    if (file_exists($cacheFile)) {
        $cacheData = json_decode(file_get_contents($cacheFile), true);
        
        // 检查缓存是否过期
        if (isset($cacheData['cache_time']) && 
            (time() - $cacheData['cache_time']) < CACHE_EXPIRE) {
            return [
                'success' => true,
                'data' => $cacheData,
                'from_cache' => true
            ];
        }
    }
    
    // 调用API查询
    $apiUrl = "https://api.vore.top/api/IPdata?ip=" . urlencode($ip);
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $apiUrl,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 5,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error || $httpCode !== 200) {
        return [
            'success' => false,
            'error' => 'API请求失败: ' . ($error ?: "HTTP {$httpCode}")
        ];
    }
    
    $data = json_decode($response, true);
    
    if (!$data || !isset($data['code']) || $data['code'] !== 200) {
        return [
            'success' => false,
            'error' => 'API返回数据异常'
        ];
    }
    
    // 处理返回数据格式
    $processedData = processIPData($data);
    $processedData['cache_time'] = time();
    
    // 保存到缓存（使用IP格式文件名）
    file_put_contents($cacheFile, json_encode($processedData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    
    return [
        'success' => true,
        'data' => $processedData,
        'from_cache' => false
    ];
}

/**
 * 处理API返回的IP数据
 * @param array $apiData API返回的数据
 * @return array 处理后的数据
 */
function processIPData($apiData) {
    $result = [
        'ip' => $apiData['ipinfo']['text'] ?? '',
        'type' => $apiData['ipinfo']['type'] ?? '',
        'cnip' => $apiData['ipinfo']['cnip'] ?? false,
        'location' => '',
        'isp' => '',
        'full_text' => '',
        'raw_data' => $apiData
    ];
    
    // 构建地理位置
    $locationParts = [];
    
    // 使用info1, info2, info3构建地址
    if (isset($apiData['ipdata']['info1']) && !empty($apiData['ipdata']['info1'])) {
        $locationParts[] = $apiData['ipdata']['info1'];
    }
    
    if (isset($apiData['ipdata']['info2']) && !empty($apiData['ipdata']['info2'])) {
        $locationParts[] = $apiData['ipdata']['info2'];
    }
    
    if (isset($apiData['ipdata']['info3']) && !empty($apiData['ipdata']['info3'])) {
        $locationParts[] = $apiData['ipdata']['info3'];
    }
    
    $result['location'] = implode('', $locationParts);
    
    // 获取ISP
    if (isset($apiData['ipdata']['isp']) && !empty($apiData['ipdata']['isp'])) {
        $result['isp'] = $apiData['ipdata']['isp'];
    } elseif (isset($apiData['adcode']['o'])) {
        // 从adcode中提取运营商信息
        $parts = explode(' - ', $apiData['adcode']['o']);
        if (count($parts) > 1) {
            $result['isp'] = end($parts);
        }
    }
    
    // 构建完整文本：位置-运营商
    $fullText = '';
    if (!empty($result['location'])) {
        $fullText .= $result['location'];
    }
    
    if (!empty($result['isp'])) {
        if (!empty($fullText)) {
            $fullText .= '-';
        }
        $fullText .= $result['isp'];
    }
    
    $result['full_text'] = $fullText;
    
    return $result;
}

/**
 * 批量查询IP信息（减少API调用）
 * @param array $ips IP地址数组
 * @return array IP信息映射
 */
function batchQueryIPInfo($ips) {
    $results = [];
    $toQuery = [];
    
    // 先检查缓存
    foreach ($ips as $ip) {
        $cacheFile = getCacheFilename($ip);
        
        if (file_exists($cacheFile)) {
            $cacheData = json_decode(file_get_contents($cacheFile), true);
            
            if (isset($cacheData['cache_time']) && 
                (time() - $cacheData['cache_time']) < CACHE_EXPIRE) {
                $results[$ip] = [
                    'success' => true,
                    'data' => $cacheData,
                    'from_cache' => true
                ];
            } else {
                $toQuery[] = $ip;
            }
        } else {
            $toQuery[] = $ip;
        }
    }
    
    // 批量查询（单线程，但减少连接数）
    foreach ($toQuery as $ip) {
        $results[$ip] = queryIPInfo($ip);
    }
    
    return $results;
}

/**
 * 获取IP信息的格式化文本
 * @param array $ipInfo IP信息数组
 * @return string 格式化文本
 */
function formatIPInfo($ipInfo) {
    if (!$ipInfo || !isset($ipInfo['success']) || !$ipInfo['success']) {
        return '未知';
    }
    
    $data = $ipInfo['data'];
    
    // 返回完整格式：位置-运营商
    if (!empty($data['full_text'])) {
        return $data['full_text'];
    }
    
    // 如果没有完整文本，尝试组合
    $text = '';
    if (!empty($data['location'])) {
        $text .= $data['location'];
    }
    
    if (!empty($data['isp'])) {
        if (!empty($text)) {
            $text .= '-';
        }
        $text .= $data['isp'];
    }
    
    return $text ?: '未知';
}

// 直接调用示例（用于测试）
if (isset($_GET['test_ip'])) {
    header('Content-Type: application/json; charset=utf-8');
    $ip = $_GET['test_ip'];
    $result = queryIPInfo($ip);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}