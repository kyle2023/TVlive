参看微信公众号“网络志”2026年4月15日文章：【教程分享】软路由IPTV折腾记：从组播到时移回看+FCC快速换台，Tivimate终于和运营商盒子一样丝滑了！

热拔插事件发生后自动获取IPTV网关并刷新 静态IPv4路由 的脚本：99-autoiptvgateway，放到/etc/hotplug.d/iface/里，重启路由器IPTV口就自动设置 静态路由。

iptv.sh ，放到 /etc/init.d/ 文件夹内，给755 权限，shell终端执行/etc/init.d/iptv.sh 即可自动生成IPTV M3U文件，还生成了文本格式cctv1,http://192.168.1.1/rtp/223... 。
M3U文件放入到了/www/hitv.m3u，供其他终端获取，比如tivimate可以导入的M3U文件地址就是http://192.168.1.1/hitv.m3u。

来源: https://www.bandwh.com/net/2571.html、https://www.bandwh.com/net/2637.html