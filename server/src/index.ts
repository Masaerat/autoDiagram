import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { validateFlowSpec } from "../../shared/flow.js";
import { normalizeDiagramStyleId } from "../../shared/styleProfile.js";
import { drawioImageToMermaid, drawioToMermaid, mermaidToDrawio } from "./services/converters.js";
import { generateFlowSpec, InvalidOpenAIApiKeyError } from "./services/flowGenerator.js";
import { createFlowJob, jobResponse, readJob } from "./services/jobs.js";
import { buildServerConfig } from "./httpConfig.js";
import { attachLiveTranscriptionWebSocket } from "./services/liveTranscription.js";
import { TranscriptionError, transcribeUploadedStream } from "./services/transcription.js";

dotenv.config();

const app = express();
const serverConfig = buildServerConfig(process.env);
const port = serverConfig.port;
const projectRoot = process.cwd();
const clientDist = path.resolve(projectRoot, "dist", "client");
const serverStartedAt = new Date().toISOString();
const exportsDir = process.env.JOB_OUTPUT_DIR || path.join(os.tmpdir(), "auto-diagram-exports");

app.use(cors());
app.post("/api/transcribe", async (request, response) => {
  try {
    const payload = await transcribeUploadedStream(request, request.headers["x-filename"], request.headers["content-length"]);
    response.json(payload);
  } catch (error) {
    if (error instanceof TranscriptionError) {
      response.status(error.statusCode).json({ error: error.message });
      return;
    }
    response.status(500).json({ error: error instanceof Error ? error.message : "本地音频识别失败。" });
  }
});
app.use(express.json({ limit: "15mb" }));
app.use("/exports", express.static(exportsDir));
app.use(express.static(clientDist));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    renderer: "fireworks_svg_drawio"
  });
});

app.get("/api/debug/runtime", (_request, response) => {
  response.json({
    pid: process.pid,
    port,
    host: serverConfig.host,
    protocol: serverConfig.publicProtocol,
    httpsEnabled: Boolean(serverConfig.https),
    startedAt: serverStartedAt,
    cwd: process.cwd(),
    openaiTimeoutMs: process.env.OPENAI_TIMEOUT_MS || "60000",
    generateTimeoutMs: process.env.GENERATE_TIMEOUT_MS || "75000",
    jobOutputDir: exportsDir,
    renderer: "fireworks_svg_drawio",
    defaultStyleId: 1
  });
});

app.post("/api/convert/mermaid-to-drawio", (request, response) => {
  try {
    const mermaid = String(request.body?.mermaid ?? "").trim();
    if (mermaid.length < 2) {
      response.status(400).json({ error: "请输入 Mermaid 代码。" });
      return;
    }
    response.json(mermaidToDrawio(mermaid));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Mermaid 转 Draw.io 失败。" });
  }
});

app.post("/api/convert/drawio-to-mermaid", (request, response) => {
  try {
    const drawioImage = String(request.body?.drawioImage ?? request.body?.imageDataUrl ?? "").trim();
    const drawio = String(request.body?.drawio ?? "").trim();
    if (drawioImage.length >= 2) {
      response.json(drawioImageToMermaid(drawioImage));
      return;
    }
    if (drawio.length < 2) {
      response.status(400).json({ error: "请上传 Draw.io 文件。" });
      return;
    }
    response.json(drawioToMermaid(drawio));
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Draw.io 转 Mermaid 失败。" });
  }
});

function withRequestTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`请求处理超过 ${Math.round(timeoutMs / 1000)} 秒。`)), timeoutMs);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

app.post("/api/flow/generate", async (request, response) => {
  const startedAt = Date.now();
  try {
    const transcript = String(request.body?.transcript ?? "").trim();
    const styleId = normalizeDiagramStyleId(request.body?.styleId);
    const apiKey = Array.isArray(request.headers["x-openai-api-key"]) ? request.headers["x-openai-api-key"][0] : request.headers["x-openai-api-key"];
    if (transcript.length < 2) {
      response.status(400).json({ error: "请输入至少两个字符的流程描述。" });
      return;
    }

    const payload = await withRequestTimeout(
      (async () => {
        const flow = await generateFlowSpec(transcript, { apiKey });
        const warnings = Array.from(new Set([...(flow.warnings ?? []), ...validateFlowSpec(flow)]));
        const job = await createFlowJob({ ...flow, warnings }, warnings, styleId);
        return jobResponse(job);
      })(),
      Number(process.env.GENERATE_TIMEOUT_MS || 75000)
    );
    response.setHeader("X-AutoDiagram-Elapsed-Ms", String(Date.now() - startedAt));
    response.json(payload);
  } catch (error) {
    if (error instanceof InvalidOpenAIApiKeyError) {
      response.status(401).json({ code: "INVALID_API_KEY", error: error.message });
      return;
    }
    response.status(500).json({
      error: error instanceof Error ? error.message : "流程图生成失败。"
    });
  }
});

app.get("/api/flow/jobs/:jobId", async (request, response) => {
  const job = await readJob(request.params.jobId);
  if (!job) {
    response.status(404).json({ error: "JOB_NOT_FOUND", reason: "未找到流程图任务。" });
    return;
  }

  response.json(jobResponse(job));
});

app.get(/^(?!\/api|\/exports).*/, (_request, response) => {
  response.sendFile(path.join(clientDist, "index.html"));
});

const server = serverConfig.https
  ? https.createServer(
      {
        cert: fs.readFileSync(serverConfig.https.certPath),
        key: fs.readFileSync(serverConfig.https.keyPath)
      },
      app
    )
  : http.createServer(app);

attachLiveTranscriptionWebSocket(server);

function localNetworkHosts(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

function publicUrls(): string[] {
  const hosts = serverConfig.host === "0.0.0.0" ? localNetworkHosts() : [serverConfig.host];
  return hosts.map((host) => serverConfig.publicProtocol + "://" + host + ":" + port);
}

server.listen(port, serverConfig.host, () => {
  const urls = publicUrls();
  console.log("AutoDiagram listening on " + serverConfig.publicProtocol + "://" + serverConfig.host + ":" + port);
  if (urls.length > 0) console.log("Open " + urls.join(" or "));
});
