# AutoDiagram

AutoDiagram 是一个面向流程描述的可视化生成工具。用户可以输入文字、上传音视频转写，或使用浏览器麦克风实时语音输入，系统会将流程描述生成可预览和下载的流程图产物。

项目包含 React 前端、Express 后端、本地音视频转写服务、实时语音 WebSocket，以及 SVG/Draw.io 渲染和格式转换能力。

## 功能特性

- 文字流程描述生成流程图。
- 支持多套流程图样式。
- 支持 SVG 预览、PNG 预览和 Draw.io XML 下载。
- 支持 Mermaid 转 Draw.io。
- 支持 Draw.io 文件转 Mermaid。
- 支持上传音频/视频文件转写文字。
- 支持浏览器麦克风实时语音输入，停顿后自动识别整句。
- 支持本地 `faster-whisper` 识别模型。
- 支持 HTTPS 局域网访问，满足浏览器麦克风权限要求。

## 技术栈

- 前端：React、Vite、TypeScript
- 后端：Node.js、Express、WebSocket
- 转写：Python、faster-whisper
- 渲染：SVG、Draw.io XML
- 测试：Vitest
- 部署：PM2、HTTPS 证书

## 目录结构

```text
autoDiagram/
├── client/                  # React 前端
├── server/                  # Express API、转写服务、渲染服务
│   ├── scripts/             # Python 转写脚本
│   └── src/
├── shared/                  # 前后端共享类型和流程结构
├── deploy/                  # Nginx 和局域网 HTTPS 说明
├── docs/                    # 项目文档
├── exports/                 # 运行时导出目录
├── ecosystem.https.config.cjs
├── package.json
└── vite.config.ts
```

## 环境要求

- Node.js 20 或更高版本
- npm
- Python 3.10 或更高版本
- ffmpeg
- 可选：PM2，用于服务器常驻运行
- 可选：mkcert，用于生成本地或局域网 HTTPS 证书

## 安装依赖

```bash
npm install
```

如需使用本地语音识别，建议在项目目录创建 Python 虚拟环境：

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -U pip setuptools wheel
./.venv/bin/python -m pip install -U faster-whisper
```

Windows PowerShell 示例：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -U pip setuptools wheel
.\.venv\Scripts\python.exe -m pip install -U faster-whisper
```

## 环境变量

复制示例配置：

```bash
cp .env.example .env
```

常用配置：

```text
OPENAI_API_KEY=                 # 可选，生成流程图时调用模型使用
OPENAI_MODEL=
OPENAI_BASE_URL=
PORT=27300

TRANSCRIBE_MODEL=base
TRANSCRIBE_LANGUAGE=zh
TRANSCRIBE_OFFLINE=1
TRANSCRIBE_WORKER=1
TRANSCRIBE_MAX_BYTES=104857600
TRANSCRIBE_TIMEOUT_MS=600000
```

如果服务器上指定了 Python 虚拟环境，可以在 `.env` 中设置：

```text
TRANSCRIBE_PYTHON=/home/gpt/autoDiagram/.venv/bin/python
```

## 本地开发

启动前端和后端开发服务：

```bash
npm run dev
```

默认端口：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:27300`

只启动后端：

```bash
npm run dev:server
```

只启动前端：

```bash
npm run dev:client
```

## 构建和启动

构建生产包：

```bash
npm run build
```

启动生产服务：

```bash
npm start
```

服务默认监听：

```text
http://127.0.0.1:27300
```

## HTTPS 和麦克风访问

浏览器只允许 HTTPS、`localhost` 或 `127.0.0.1` 页面访问麦克风。局域网机器访问时必须使用可信 HTTPS。

生产环境可通过 PM2 启动 HTTPS 服务：

```bash
pm2 start ecosystem.https.config.cjs --only auto-diagram-https
pm2 save
pm2 status
```

默认 HTTPS 配置见：

```text
ecosystem.https.config.cjs
```

更多说明见：

- [局域网 HTTPS 录音访问](docs/lan-https.md)
- [手动部署流程](docs/manual-deploy.md)

## 部署

推荐按手动部署文档执行：

```text
docs/manual-deploy.md
```

部署时必须保留服务器本地内容：

```text
.env
certs/
.venv/
exports/
```

这些目录和文件不应放进部署包：

```text
node_modules/
dist/
.env
certs/
*.tsbuildinfo
```
