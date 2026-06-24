# AutoDiagram 手动部署流程

本文记录本地开发完成后，将 AutoDiagram 重新部署到服务器的完整步骤。

## 1. 本地验证和打包

在本地进入 AutoDiagram 项目目录：

```powershell
cd D:\Code\autoDiagram
```

先确认测试和构建通过：

```powershell
npm test
npm run build
```

打包源码：

```powershell
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipName = "autoDiagram-manual-deploy-$timestamp.zip"

Compress-Archive `
  -Path client,deploy,docs,server,shared,.env.example,.gitignore,ecosystem.https.config.cjs,package.json,package-lock.json,tsconfig.json,tsconfig.app.json,tsconfig.node.json,vite.config.ts,vitest.config.ts `
  -DestinationPath $zipName `
  -CompressionLevel Optimal `
  -Force
```

上传到服务器：

```powershell
scp $zipName gpt@172.23.17.242:/home/gpt/
```

## 2. 服务器解压和替换

登录服务器：

```bash
ssh gpt@172.23.17.242
cd /home/gpt
```

设置本次部署时间和包名。将 `autoDiagram-manual-deploy-你的时间戳.zip` 替换为实际上传的文件名：

```bash
timestamp=$(date +%Y%m%d-%H%M%S)
zipName=autoDiagram-manual-deploy-你的时间戳.zip
```

解压新包：

```bash
rm -rf autoDiagram-new
mkdir -p autoDiagram-new
unzip -oq "$zipName" -d autoDiagram-new
```

保留服务器本地运行配置和数据：

```bash
cp autoDiagram/.env autoDiagram-new/.env
cp -a autoDiagram/certs autoDiagram-new/certs
cp -a autoDiagram/.venv autoDiagram-new/.venv
cp -a autoDiagram/exports autoDiagram-new/exports 2>/dev/null || mkdir -p autoDiagram-new/exports
```

替换项目目录：

```bash
mv autoDiagram autoDiagram-bak-$timestamp
mv autoDiagram-new autoDiagram
cd autoDiagram
```

## 3. 安装依赖和构建

在服务器的新目录中执行：

```bash
npm install
npm run build
```

## 4. 重建 PM2 服务

只保留 HTTPS 服务，删除旧的 HTTP 服务：

```bash
pm2 stop auto-diagram auto-diagram-https 2>/dev/null || true
pm2 delete auto-diagram auto-diagram-https 2>/dev/null || true
pm2 start ecosystem.https.config.cjs --only auto-diagram-https
pm2 save
pm2 status
```

正常情况下，PM2 中只需要看到：

```text
auto-diagram-https
```

## 5. 验证部署

检查服务运行信息：

```bash
curl -k https://127.0.0.1:27300/api/debug/runtime
```

查看日志：

```bash
pm2 logs auto-diagram-https --lines 50
```

如果 HTTPS 服务正常，日志中应该能看到类似：

```text
AutoDiagram listening on https://0.0.0.0:27300
```

## 6. 语音识别环境修复

如果语音识别时报错：

```text
spawn /home/gpt/autoDiagram/.venv/bin/python ENOENT
```

说明 `.venv` 没有复制成功，或者服务器上还没有创建 Python 虚拟环境。

在服务器上执行：

```bash
cd /home/gpt/autoDiagram
python3 -m venv .venv
./.venv/bin/python -m pip install -U pip setuptools wheel
./.venv/bin/python -m pip install -U faster-whisper
sudo apt install -y ffmpeg
pm2 restart auto-diagram-https --update-env
```

确认 Python 路径存在：

```bash
ls -l /home/gpt/autoDiagram/.venv/bin/python
```

## 7. 部署时必须保留的服务器本地内容

每次替换目录时，必须从旧目录复制以下内容到新目录：

```text
.env
certs/
.venv/
exports/
```

说明：

- `.env` 保存端口、模型、Python 路径等运行配置。
- `certs/` 保存 HTTPS 证书，浏览器麦克风访问依赖 HTTPS。
- `.venv/` 保存本地语音识别依赖，例如 `faster-whisper`。
- `exports/` 保存运行期间生成的导出文件。

## 8. 回滚方式

如果新版本部署后有问题，可以回滚到上一个备份目录：

```bash
cd /home/gpt
pm2 stop auto-diagram-https
mv autoDiagram autoDiagram-bad-$(date +%Y%m%d-%H%M%S)
mv autoDiagram-bak-对应时间戳 autoDiagram
cd autoDiagram
pm2 start ecosystem.https.config.cjs --only auto-diagram-https
pm2 save
pm2 status
```

将 `autoDiagram-bak-对应时间戳` 替换为实际备份目录名。
