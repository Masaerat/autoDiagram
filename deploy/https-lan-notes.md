# AutoDiagram LAN HTTPS

Current direct HTTPS service:

```text
https://172.23.17.242:27300
https://172.24.21.93:27300
```

The HTTPS PM2 process is `auto-diagram-https` and is configured by:

```text
ecosystem.https.config.cjs
```

Certificates:

```text
certs/auto-diagram-ca.pem
certs/auto-diagram.pem
certs/auto-diagram-key.pem
```

For microphone access from another computer, import `certs/auto-diagram-ca.pem` as a trusted root certificate on that computer, then open one of the HTTPS URLs above. Without trusting the CA, browsers will still block microphone access for the LAN HTTPS page.

Useful commands:

```bash
pm2 restart auto-diagram-https
pm2 logs auto-diagram-https
curl -k https://127.0.0.1:27300/api/debug/runtime
```
