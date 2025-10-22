<?php
// 设置基础 URL 模板，若断流，可使用跳转后的 61.150开头的ip
$baseUrl = "http://124.232.231.172:8089/000000002000/{id}/index.m3u8";

// 获取 GET 参数
$id = isset($_GET['id']) ? trim($_GET['id']) : '';
$playseek = isset($_GET['playseek']) ? trim($_GET['playseek']) : '';

if (empty($id)) {
    header("HTTP/1.1 400 Bad Request");
    echo "缺少参数 id";
    exit;
}

// 替换 id
$url = str_replace("{id}", $id, $baseUrl);

// 如果存在 playseek 参数，则为回看
if (!empty($playseek)) {
    // playseek 格式：20251015190000-20251015193000
    if (preg_match('/^(\d{14})-(\d{14})$/', $playseek, $m)) {
        $startRaw = $m[1];
        $endRaw = $m[2];

        // 转换为时间对象并减去8小时
        $start = date('Ymd\THis', strtotime($startRaw) - 8 * 3600);
        $end = date('Ymd\THis', strtotime($endRaw) - 8 * 3600);

        // 拼接 URL
        $url .= "?starttime={$start}&endtime={$end}";
    } else {
        header("HTTP/1.1 400 Bad Request");
        echo "playseek 格式错误，应为 20251015190000-20251015193000";
        exit;
    }
} else {
    // 正常直播播放
    $url .= "?zte_offset=30&ispcode=2&starttime=";
}

// 302 跳转
header("Location: $url", true, 302);
exit;
?>
