<?php
header('Content-Type: text/plain; charset=utf-8');

// 基础 URL
$baseUrl = "https://www.douyu.com/gapi/rknc/directory/mixListV1/2_208/";
$cacheDir = __DIR__ . '/cache';
$cacheFile = "$cacheDir/douyuyqk.m3u";
$cacheTime = 30 * 60; // 缓存时间 30 分钟

// 确保缓存目录存在
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0777, true);
}

// 获取当前时间
$currentTime = date('Y-m-d H:i:s');

// 插入一个特殊的频道（包含当前时间）
$playlist = [
    "#EXTM3U",
    "#EXTINF:-1 tvg-name=\"$currentTime\" tvg-logo=\"https://shark2.douyucdn.cn/front-publish/douyu-web-master/_next/static/media/logo.866d9f02.png\" group-title=\"更新时间\",$currentTime",
    "https://cdn.jsdelivr.net/gh/feiyangdigital/testvideo/time/time.mp4"
];

// 检查是否带有 id 参数
$id = isset($_GET['id']) ? $_GET['id'] : null;
if ($id) {
    $apiUrl = 'https://wxapp.douyucdn.cn/api/nc/stream/roomPlayer';
    $postData = "room_id=$id&big_ct=cph-androidmpro&did=10000000000000000000000000001501&mt=1&rate=0";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, FALSE);
    curl_setopt($ch, CURLOPT_POST, TRUE);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    $result = curl_exec($ch);
    curl_close($ch);

    $json = json_decode($result);
    $mediaUrl = $json->data->live_url ?? null;
    if ($mediaUrl) {
        header('Location: ' . $mediaUrl);
        exit;
    } else {
        header('HTTP/1.1 404 Not Found');
        echo "Stream not found.";
        exit;
    }
}

// 检查缓存是否有效
if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTime)) {
    readfile($cacheFile);
    exit;
}

// 通用函数：发送请求
function sendRequest($url, $postData = null) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    if ($postData) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    }
    $result = curl_exec($ch);
    curl_close($ch);
    return $result;
}

// 初始化播放列表
//$playlist = ["#EXTM3U"];
$groupedData = [];
$host = $_SERVER['HTTP_HOST'];

$script = $_SERVER['SCRIPT_NAME'];
$basePath = "http://$host$script";

// 循环请求 API 数据
$page = 1;
while (true) {
    $url = $baseUrl . $page;
    $response = sendRequest($url);
    $data = json_decode($response, true);

    if (!$data || $data['code'] !== 0) {
        break; // 如果数据无效，停止请求
    }

    // 处理数据
    foreach ($data['data']['rl'] as $item) {
        $rid = $item['rid'];
        $rn = $item['rn'];
        $nn = $item['nn'];
        $c2name = $item['c2name'];
        $logo = isset($item['av']) ? $item['av'] : '';

        if (!isset($groupedData[$c2name])) {
            $groupedData[$c2name] = [];
        }
        $groupedData[$c2name][] = [
            'rid' => $rid,
            'rn' => $rn,
            'nn' => $nn,
            'logo' => $logo,
            'c2name' => $c2name
        ];
    }

    // 检查当前页是否返回空数组，表示没有更多数据
    if (empty($data['data']['rl'])) {
        break; // 如果当前页数据为空，退出循环
    }

    $page++; // 否则继续请求下一页
}


// 按分类名排序
//ksort($groupedData);

// 生成 M3U 播放列表
foreach ($groupedData as $c2name => $items) {
    foreach ($items as $item) {
        $rid = $item['rid'];
        $rn = $item['rn'];
        $nn = $item['nn']; // 主播昵称
        $logo = $item['logo'];
        $playlist[] = "#EXTINF:-1 tvg-logo=\"$logo\" group-title=\"$c2name\",$rn @$nn";
        $playlist[] = "$basePath?id=$rid";
    }
}

// 保存到缓存文件
file_put_contents($cacheFile, implode("\n", $playlist));

// 输出播放列表
echo implode("\n", $playlist);
?>
