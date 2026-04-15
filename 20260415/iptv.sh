#!/bin/sh

############################
# 必填（抓包 / 盒子获取）
############################
KEY=""                             # iptv密码，8位
USERID=""                          # IPTV账号，不含@vod，后面拼接了@vod
STBID=""                           # 机顶盒序列号，如：2A000000000000000000000000000060，机顶盒铭牌出或抓包处有
MAC=""                             # 机顶盒MAC地址
GOT_FILE="/usr/share/myfile/iptv"  # 自定义保存的各种网页文件、TOKEN等
ITV_HOST=""                        # 认证服务器地址，GET /auth?UserID= 处的主机名，如：http://1.2.3.4:8298",非ip的域名注意用运行商dns解析
IPTVINTERFACE=""                   # IPTV网卡接口，如eth3、eth1.2等
USERAGENT=""                       # 机顶盒的用户代理，如：ZTC HUAWEI Resolution(PAL,720p,1080i) AppleWebKit/535.7 (KHTML, like Gecko) Chrome/16.0.912.63 Safari/535.7
ROUTEIP=""                         # rtp2httpd地址，格式 http://192.168.1.1:5140

echolog() {
    local d="$(date "+%Y-%m-%d %H:%M:%S")"
    echo "$d: [IPTV]$*" >> "/usr/share/myfile/iptv.log"
}

# 获取iptv接口ip，本例在eth4口上
get_iptvip() {
    IP=$(ip -4 addr show dev ${IPTVINTERFACE} scope global | awk '/inet / {print $2}' | cut -d/ -f1)
}

############################
# DES3 ECB 加密（HEX）
############################
des3_encrypt() {
  # params: plaintext (string), key (optional)
  plain="$1"
  k="$2"
  [ -z "$k" ] && k="$key"
  if [ -z "$k" ]; then
    printf '%s' "ERR:no key provided" >&2
    return 1
  fi

  # build 24-byte ASCII key: key + 16 ASCII '0'
  key24="$k"
  i=0
  while [ "$i" -lt 16 ]; do
    key24="${key24}0"
    i=$((i+1))
  done

  # compute padlen (PKCS#7 style for blocksize=8)
  len=$(printf '%s' "$plain" | wc -c)
  mod=$((len % 8))
  padlen=$((8 - mod))
  if [ "$mod" -eq 0 ]; then
    padlen=8
  fi

  tf_plain="$(mktemp -t getiptv_plain.XXXXXX 2>/dev/null || echo /tmp/getiptv_plain.$$)"
  printf '%s' "$plain" > "$tf_plain"
  awk -v n="$padlen" -v v="$padlen" 'BEGIN{ for(i=0;i<n;i++) printf "%c", v }' >> "$tf_plain"

  # convert key24 (ASCII) to hex
  keyhex="$(printf '%s' "$key24" | hexdump -v -e '/1 "%02x"')"

  # encrypt using openssl (3DES ECB)
  tf_out="$(mktemp -t getiptv_out.XXXXXX 2>/dev/null || echo /tmp/getiptv_out.$$)"
  if ! openssl enc -des-ede3 -nosalt -nopad -K "$keyhex" -in "$tf_plain" -out "$tf_out" 2>/dev/null; then
    rm -f "$tf_plain" "$tf_out"
    printf '%s' "ERR:openssl encrypt failed" >&2
    return 2
  fi

  hexdump -v -e '/1 "%02x"' "$tf_out"

  rm -f "$tf_plain" "$tf_out"
  return 0
}


############################
# 1. 获取 CTCGetAuthInfo
############################
get_ctc_token() {

    URL="$ITV_HOST/auth?UserID=${USERID}&Action=Login"

    PAGE=$(curl -s -L -A "$USERAGENT" "$URL" | tee $GOT_FILE/iptvlogin)

    CTC_TOKEN=$(echo "$PAGE"| sed -n "s/.*CTCGetAuthInfo('\([^']*\)').*/\1/p")

    if [ -z "$CTC_TOKEN" ]; then
        echolog "[-] 获取 CTCGetAuthInfo 失败"
        exit 1
    else
        echolog "当前 CTCGetAuthInfo 是 $CTC_TOKEN"
    fi
}

############################
# 2. 生成 Authenticator
############################
make_authenticator() {

    RAND=$(tr -dc 0-9 </dev/urandom | head -c8)

    SESSION_REF="${RAND}\$${CTC_TOKEN}\$${USERID}\$${STBID}\$${IP}\$${MAC}\$\$CTC"
    #echo "$SESSION_REF"

    AUTHENTICATOR=$(des3_encrypt "$SESSION_REF" "$KEY")
    
    if [ -z "$AUTHENTICATOR" ]; then
        echolog "[-] DES3 加密失败"
        exit 1
    else
        echolog "当前加密生成的 AUTHENTICATOR 是 $AUTHENTICATOR "
    fi
    
}

############################
# 3. 获取 usertoken 作为cookie
############################
get_usertoken() {
    RESP=$(curl -s \
        -c $GOT_FILE/usertoken.cookie \
        -A "$USERAGENT" \
        -d "UserID=${USERID}" \
        -d "Authenticator=${AUTHENTICATOR}" \
        -d "AccessMethod=dhcp" \
        -d "AccessUserName=${USERID}@vod" \
        "$ITV_HOST/uploadAuthInfo" | tee $GOT_FILE/iptvuploadAuthInfo)

    USERTOKEN=$(echo "$RESP" | sed -n "s/.*UserToken','\([^']*\)'.*/\1/p")

    if [ -z "$USERTOKEN" ]; then
        echo "[-] USERTOKEN 获取失败"
        exit 1
    else
        echolog "当前 usertoken 是 $USERTOKEN"
    fi
}

############################
# 4、得到 JSESSIONID 
############################
get_session() {
    RESP=$(curl -s \
        -A "$USERAGENT" \
        -b "UserToken=$USERTOKEN" \
        "$ITV_HOST/getServiceList" | tee $GOT_FILE/getServiceList)
    
    UserGroupNMBURL=$(echo "$RESP" | sed -n "s/.*location='\(http:\/\/[^\']*\)'.*/\1/p")

    if [ -z "$UserGroupNMBURL" ]; then
        echolog "[-] UserGroupNMB 链接获取失败"
        exit 1    
    else
        echolog "当前 UserGroupNMB 链接是 $UserGroupNMBURL"
    fi

    RESP=$(curl -s \
        -A "$USERAGENT" \
        "$UserGroupNMBURL" | tee $GOT_FILE/UserGroupNMB )
    
    loadbancedurl=$(echo "$RESP" | sed -n "s/.*location[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p")

    if [ -z "$loadbancedurl" ]; then
        echolog "[-] loadbancedurl 获取失败"
        exit 1    
    else
        echolog "当前 loadbancedurl 是 $loadbancedurl"
    fi    
    
    # 获取新负载均衡服务器地址
    AUTHHOST=$(echo "$loadbancedurl" | cut -d/ -f1-3)
    
    # 获得cookie，从响应头获取
    JSESSIONID=$(curl -s -A "$USERAGENT" -D - "$loadbancedurl" -o $GOT_FILE/loadbancedurl \
        | grep -i '^Set-Cookie:' \
        | awk '{print $2}' \
        | cut -d';' -f1)
    
    echo "$JSESSIONID" > $GOT_FILE/JSESSIONID
    
    if [ -z "$JSESSIONID" ]; then
        echolog "[-] JSESSIONID 获取失败"
        exit 1    
    else
        echolog "当前 JSESSIONID 是 $JSESSIONID"
    fi    
    
    post_data=$(cat "$GOT_FILE/loadbancedurl" \
        | grep -i '<input' \
        | grep -i 'type="hidden"' \
        | sed -n 's/.*name="\([^"]*\)".*value="\?\([^">]\+\)"\?.*/\1=\2/p' \
        | tr '\n' '&' | sed 's/&$//')

}

############################
# 5. 获取组播频道列表
############################
get_channel_list() {
    #先进行验证直播源获取主要url为funcportalauth、frameset_judger
    RESP=$(curl -s \
        -A "$USERAGENT" \
        -b "$JSESSIONID" \
        -d "$post_data" \
        -d "stbtype=B860AV1.1" \
        "$AUTHHOST/iptvepg/function/funcportalauth.jsp" | tee $GOT_FILE/funcportalauth)    
    
    RESP=$(curl -s \
        -A "$USERAGENT" \
        -b "$JSESSIONID" \
        -d "picturetype=1,3,5" \
        "$AUTHHOST/iptvepg/function/frameset_judger.jsp" | tee $GOT_FILE/frameset_judger)
        
    post_builder_data=$(cat "$GOT_FILE/frameset_judger" \
        | grep -i '<input' \
        | grep -i 'type="hidden"' \
        | sed -n 's/.*name="\([^"]*\)".*value="\?\([^">]\+\)"\?.*/\1=\2/p' \
        | tr '\n' '&' | sed 's/&$//')
    
    echolog "[+] 获取组播频道列表..."
    # 获取节目列表，下面参数不能少
    PAGE=$(curl -s \
        -b "$JSESSIONID" \
        -A "$USERAGENT" \
        -d "$post_builder_data" \
        -d "hdmistatus=""" \
        "$AUTHHOST/iptvepg/function/frameset_builder.jsp" | tee $GOT_FILE/iptvlist)    

    if [ -z "$PAGE" ]; then
        echolog "[-] 未获取到频道列表"
        exit 1
    else
        echolog "已获取到频道列表，网页保存在$GOT_FILE/iptvlist"
    fi

    TXT="$GOT_FILE/hitv.txt"
    M3U="$GOT_FILE/hitv.m3u"

    echo "#EXTM3U url-tvg=\"http://e.erw.cc/e.xml\"" > "$M3U"
    echo "" > "$TXT"
    echo "" > "$GOT_FILE/iptvlist.sort"
    
    cat $GOT_FILE/iptvlist | grep -o 'ChannelID="[^"]*".*ChannelFccAgentAddr="[^"]*"' | \
    while read -r line; do
        CID=$(echo "$line" | sed -n 's/.*ChannelID="\([^"]*\)".*/\1/p')
        NAME=$(echo "$line" | sed -n 's/.*ChannelName="\([^"]*\)".*/\1/p')
        RTP=$(echo "$line" | sed -n 's/.*ChannelURL="igmp:\/\/\([^"]*\)".*/\1/p')
        BACK=$(echo "$line" | sed -n 's/.*TimeShiftURL="\([^"]*\)".*/\1/p')
        FFC=$(echo "$line" | sed -n 's/.*ChannelFCCServerAddr="\([^"]*\)".*/\1/p')

        if echo "$NAME" | grep -iqE 'hd|4k'; then
            # 进行时移链接转换
            BACK=$(echo "$BACK" | sed "s#^rtsp://#${ROUTEIP}/rtsp/#")    
            # 写入临时排序文件：用 | 分隔字段
            echo "${CID}|${NAME}|${RTP}|${BACK}|${FFC}" >> "$GOT_FILE/iptvlist.sort"
        fi
    done

    sort -n -t'|' -k 1 "$GOT_FILE/iptvlist.sort" | while IFS='|' read -r CID NAME RTP BACK FFC; do
        echo -e "${NAME},${ROUTEIP}/rtp/${RTP}?fcc=${FFC}\n${NAME},${BACK}" >> "$TXT"
        echo "#EXTINF:-1 tvg-id="\"${CID}\"" tvg-name="\"${NAME}\"" catchup="\"default\"" catchup-source="\"${BACK}\&playseek={utc:YmdHMS\}-{utcend:YmdHMS}\"" tvg-logo="\"\"" group-title="\"ITV\"",${NAME}" >> "$M3U"        
        echo "${ROUTEIP}/rtp/${RTP}?fcc=${FFC}" >> "$M3U"

    done
    
    cp -f "$M3U" /www
    cp -f "$TXT" /www
    chmod 644 /www/hitv.m3u
    chmod 644 /www/hitv.txt
    echolog "IPTV 播放列表 生成完毕。$TXT $M3U"

}

############################
# 主流程
############################
mkdir -p "$GOT_FILE"
echo "" >> /usr/share/myfile/iptv.log
get_iptvip
get_ctc_token
make_authenticator
get_usertoken
get_session
get_channel_list