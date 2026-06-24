# 局域网 HTTPS 录音访问

浏览器只允许 HTTPS、localhost 或 127.0.0.1 页面访问麦克风。局域网地址如 `http://192.168.x.x:27300` 会被浏览器拦截，所以局域网录音必须使用可信 HTTPS。

## 生成 mkcert 证书

1. 安装 mkcert，并执行一次信任根证书：

```bash
mkcert -install
```

2. 查看开发机的局域网 IP，例如 `192.168.1.20`。

3. 为 localhost 和局域网 IP 生成证书：

```bash
mkdir -p certs
mkcert -cert-file certs/auto-diagram.pem -key-file certs/auto-diagram-key.pem localhost 127.0.0.1 192.168.1.20
```

把命令里的 `192.168.1.20` 换成你的开发机局域网 IP。证书文件位于 `certs/`，不会提交到仓库。

## 生产构建后启动

日常部署只使用一个 HTTPS 入口，前端、API 和实时语音 WebSocket 都走同一个端口。

```bash
npm run build
npm run start:lan:https
```

默认 HTTPS 端口是 `27300`。也可以显式设置：

```bash
HOST=0.0.0.0 PORT=27300 HTTPS_CERT=certs/auto-diagram.pem HTTPS_KEY=certs/auto-diagram-key.pem npm start
```
