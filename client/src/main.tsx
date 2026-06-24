import React from "react";
import { createRoot } from "react-dom/client";
import type { GenerateFlowResponse } from "../../shared/flow";
import { defaultDiagramStyleId, styleOptions, type DiagramStyleId } from "../../shared/styleProfile";
import paceLogo from "./assets/pace-logo.png";
import "./styles.css";
import { LiveVoiceClient } from "./liveVoiceClient";
import { browserVoiceInputEnvironment, getVoiceInputSupportError, voiceInputStartErrorMessage } from "./voiceSupport";

type PreviewMode = "svg" | "png";
type PreviewZoomMode = "fit" | "readable";

type PreviewSize = {
  width: number;
  height: number;
};

type MermaidConvertResponse = {
  drawio: string;
  filename: string;
  nodeCount: number;
  edgeCount: number;
  warnings: string[];
};

type DrawioConvertResponse = {
  mermaid: string;
  filename: string;
  nodeCount: number;
  edgeCount: number;
  warnings: string[];
};

type TranscribeResponse = {
  text: string;
  filename: string;
  duration?: number;
  language?: string;
  warnings: string[];
};

const apiKeyStorageKey = "autoDiagram.openaiApiKey";
const sampleTranscript =
  "请输入你先要转化的流程";

// const sampleMermaid = `flowchart TD
//   start((开始)) --> submit[提交申请]
//   submit --> check{资料完整？}
//   check -->|是| approve[主管审批]
//   check -->|否| supplement[补充资料]
//   approve --> endNode((结束))`;
const sampleMermaid = "请输入你想要转化的Mermaid代码";

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function svgBackground(svg: string): string {
  const match = svg.match(/<rect[^>]+class="canvas"[^>]+fill="([^"]+)"/);
  return match?.[1] ?? "#ffffff";
}

function appendSpokenText(current: string, next: string): string {
  const spoken = next.trim();
  if (!spoken) return current;
  const base = current.trimEnd();
  if (!base) return spoken;
  const separator = /[。！？；，,.!?;:\n]$/.test(base) ? "" : "；";
  return `${base}${separator}${spoken}`;
}

function svgSize(svg: string): PreviewSize {
  const viewBox = svg.match(/\bviewBox="([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)"/);
  if (viewBox) {
    return {
      width: Math.max(1, Number(viewBox[3]) || 1),
      height: Math.max(1, Number(viewBox[4]) || 1)
    };
  }

  const width = svg.match(/\bwidth="([\d.-]+)"/);
  const height = svg.match(/\bheight="([\d.-]+)"/);
  return {
    width: Math.max(1, Number(width?.[1]) || 1200),
    height: Math.max(1, Number(height?.[1]) || 800)
  };
}

async function svgToPngDataUrl(svg: string): Promise<string> {
  const image = new Image();
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG 转 PNG 失败。"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 1200;
    canvas.height = image.naturalHeight || 800;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器不支持 Canvas。");
    context.fillStyle = svgBackground(svg);
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function App() {
  const [apiKey, setApiKey] = React.useState(() => localStorage.getItem(apiKeyStorageKey) || "");
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [transcript, setTranscript] = React.useState(sampleTranscript);
  const [styleId, setStyleId] = React.useState<DiagramStyleId>(defaultDiagramStyleId);
  const [result, setResult] = React.useState<GenerateFlowResponse | null>(null);
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("svg");
  const [previewZoomMode, setPreviewZoomMode] = React.useState<PreviewZoomMode>("fit");
  const [pngDataUrl, setPngDataUrl] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [transcribing, setTranscribing] = React.useState(false);
  const [transcribeFileName, setTranscribeFileName] = React.useState("");
  const [transcribeStatus, setTranscribeStatus] = React.useState("");
  const [transcribeError, setTranscribeError] = React.useState("");
  const [voiceRecording, setVoiceRecording] = React.useState(false);
  const [voiceProcessing, setVoiceProcessing] = React.useState(false);
  const [voiceStatus, setVoiceStatus] = React.useState("");
  const [voiceError, setVoiceError] = React.useState("");
  const liveVoiceClientRef = React.useRef<LiveVoiceClient | null>(null);

  const [mermaidInput, setMermaidInput] = React.useState(sampleMermaid);
  const [drawioFileContent, setDrawioFileContent] = React.useState("");
  const [drawioFileName, setDrawioFileName] = React.useState("");
  const [mermaidResult, setMermaidResult] = React.useState<MermaidConvertResponse | null>(null);
  const [drawioResult, setDrawioResult] = React.useState<DrawioConvertResponse | null>(null);
  const [convertError, setConvertError] = React.useState("");
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = React.useState<PreviewSize>({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return;

    const updateCanvasSize = () => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      setCanvasSize({
        width: Math.max(0, rect.width - paddingX),
        height: Math.max(0, rect.height - paddingY)
      });
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    return () => {
      void stopLocalVoiceInput();
    };
  }, []);

  function handleApiKeySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextApiKey = apiKeyInput.trim();
    if (!nextApiKey) return;
    localStorage.setItem(apiKeyStorageKey, nextApiKey);
    setApiKey(nextApiKey);
    setApiKeyInput("");
    setError("");
  }

  function handleLogout() {
    localStorage.removeItem(apiKeyStorageKey);
    setApiKey("");
    setApiKeyInput("");
    setResult(null);
    setError("");
    setPngDataUrl("");
  }

  async function hydrateResult(payload: GenerateFlowResponse) {
    setResult(payload);
    try {
      setPngDataUrl(await svgToPngDataUrl(payload.preview.svg));
    } catch {
      setPngDataUrl("");
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setPngDataUrl("");
    setPreviewMode("svg");
    setPreviewZoomMode("fit");

    try {
      const response = await fetch("/api/flow/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenAI-API-Key": apiKey },
        body: JSON.stringify({ transcript, styleId })
      });
      const payload = (await response.json()) as GenerateFlowResponse & { code?: string; error?: string };
      if (response.status === 401 || payload.code === "INVALID_API_KEY") {
        throw new Error("输入的 API key 不合法，请点击退出登录后重新输入。");
      }
      if (!response.ok) throw new Error(payload.error || "生成失败。");
      await hydrateResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败。");
    } finally {
      setLoading(false);
    }
  }

  async function stopLocalVoiceInput() {
    const client = liveVoiceClientRef.current;
    liveVoiceClientRef.current = null;
    setVoiceRecording(false);
    setVoiceProcessing(false);
    if (client) await client.stop();
  }

  async function toggleVoiceInput() {
    if (voiceRecording) {
      await stopLocalVoiceInput();
      return;
    }

    setVoiceError("");
    setTranscribeError("");
    setVoiceStatus("正在请求麦克风权限...");
    setVoiceProcessing(false);

    const voiceSupportError = getVoiceInputSupportError(browserVoiceInputEnvironment(), window.location.href);
    if (voiceSupportError) {
      setVoiceStatus("");
      setVoiceError(voiceSupportError);
      return;
    }

    const client = new LiveVoiceClient({
      onStatus: (status, message) => {
        setVoiceStatus(message);
        setVoiceProcessing(status === "transcribing");
      },
      onTranscript: (text) => {
        setTranscript((current) => appendSpokenText(current, text));
        setVoiceStatus("已识别一句语音。");
      },
      onError: (message) => {
        setVoiceError(message);
        setVoiceProcessing(false);
      }
    });

    try {
      liveVoiceClientRef.current = client;
      await client.start();
      setVoiceRecording(true);
    } catch (caught) {
      liveVoiceClientRef.current = null;
      await client.stop().catch(() => undefined);
      setVoiceRecording(false);
      setVoiceProcessing(false);
      setVoiceStatus("");
      setVoiceError(voiceInputStartErrorMessage(caught));
    }
  }

  async function handleTranscribeFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setTranscribeError("");
    setTranscribeStatus("");
    setVoiceError("");
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setTranscribing(true);
    setTranscribeFileName(file.name);
    setTranscribeStatus("正在识别音视频内容...");

    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name)
        },
        body: file
      });
      const payload = (await response.json()) as Partial<TranscribeResponse> & { error?: string };
      if (!response.ok) throw new Error(payload.error || "音频识别失败。");
      const text = String(payload.text ?? "").trim();
      if (!text) throw new Error("识别完成但没有返回文字，请确认文件中包含可识别的人声。");
      setTranscript(text);
      setTranscribeStatus(`已识别 ${payload.filename || file.name}${payload.language ? ` / ${payload.language}` : ""}`);
    } catch (caught) {
      setTranscribeError(caught instanceof Error ? caught.message : "音频识别失败。");
      setTranscribeStatus("");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleDownloadPng() {
    if (!result) return;
    const dataUrl = pngDataUrl || (await svgToPngDataUrl(result.preview.svg));
    const blob = await (await fetch(dataUrl)).blob();
    downloadBlob(result.downloads.svg.filename.replace(/\.svg$/i, ".png"), blob);
  }

  async function handleMermaidToDrawio() {
    setConvertError("");
    setMermaidResult(null);
    try {
      const response = await fetch("/api/convert/mermaid-to-drawio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mermaid: mermaidInput })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Mermaid 转 Draw.io 失败。");
      setMermaidResult(payload);
    } catch (caught) {
      setConvertError(caught instanceof Error ? caught.message : "Mermaid 转 Draw.io 失败。");
    }
  }

  async function handleDrawioToMermaid() {
    setConvertError("");
    setDrawioResult(null);
    try {
      const response = await fetch("/api/convert/drawio-to-mermaid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drawio: drawioFileContent })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Draw.io 转 Mermaid 失败。");
      setDrawioResult(payload);
    } catch (caught) {
      setConvertError(caught instanceof Error ? caught.message : "Draw.io 转 Mermaid 失败。");
    }
  }

  async function handleDrawioFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setConvertError("");
    setDrawioResult(null);
    const file = event.target.files?.[0];
    if (!file) {
      setDrawioFileContent("");
      setDrawioFileName("");
      return;
    }

    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("读取 Draw.io 文件失败。"));
        reader.readAsText(file);
      });
      setDrawioFileContent(content);
      setDrawioFileName(file.name);
    } catch (caught) {
      setDrawioFileContent("");
      setDrawioFileName("");
      setConvertError(caught instanceof Error ? caught.message : "读取 Draw.io 文件失败。");
    }
  }

  async function copyText(content: string) {
    await navigator.clipboard.writeText(content);
  }

  const previewSize = result ? svgSize(result.preview.svg) : { width: 1, height: 1 };
  const completeFitScale = result
    ? Math.min(
        1.18,
        canvasSize.width > 0 ? canvasSize.width / previewSize.width : 1,
        canvasSize.height > 0 ? canvasSize.height / previewSize.height : 1
      )
    : 1;
  const previewScale = previewZoomMode === "fit" ? completeFitScale : Math.max(1, Math.min(1.25, completeFitScale * 1.8));
  const fittedPreviewStyle = result
    ? {
        width: `${previewSize.width * previewScale}px`,
        height: `${previewSize.height * previewScale}px`
      }
    : undefined;
  const previewInnerStyle = result
    ? {
        width: `${previewSize.width}px`,
        height: `${previewSize.height}px`,
        transform: `scale(${previewScale})`
      }
    : undefined;

  return (
    <main className="app-shell">
      {!apiKey ? (
        <section className="login-shell">
          <form className="login-panel" onSubmit={handleApiKeySubmit}>
            <div className="login-brand">
              <img src={paceLogo} alt="沛城科技" />
              <span>AutoDiagram</span>
            </div>
            <h1>流程图生成工作台</h1>
            <p className="login-copy">输入 OpenAI API key 后进入工作台。key 只保存在当前浏览器中，生成时如不可用会提示重新输入。</p>
            <label className="api-key-field">
              <span>OpenAI API key</span>
              <input
                autoFocus
                type="password"
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                placeholder="sk-..."
              />
            </label>
            <button className="primary" type="submit" disabled={!apiKeyInput.trim()}>
              进入
            </button>
          </form>
        </section>
      ) : (
        <>
      <header className="app-header">
        <div className="brand-lockup">
          <img src={paceLogo} alt="沛城科技" />
          <div>
            <p className="eyebrow">AutoDiagram</p>
            <h1>流程图生成工作台</h1>
          </div>
        </div>
        <div className="header-actions">
          <div className="status-pill">API key 已保存</div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="input-pane">
          <div className="pane-header">
            <div>
              <p className="section-kicker">Input</p>
              <h2>流程描述</h2>
            </div>
            <span>{transcript.trim().length} 字</span>
          </div>

          <div className="transcribe-tools">
            <label className={`media-upload ${transcribing ? "busy" : ""}`}>
              <input type="file" accept=".mp3,.wav,.m4a,.aac,.flac,.ogg,.opus,.mp4,.mov,.mkv,.webm,audio/*,video/*" onChange={handleTranscribeFileChange} disabled={transcribing} />
              <span className="media-upload-title">{transcribing ? "识别中..." : "上传音频/视频识别文字"}</span>
              <span className="media-upload-meta">{transcribeStatus || transcribeFileName || "支持 mp3、wav、m4a、mp4、mov、mkv、webm"}</span>
            </label>
            <button
              className={`voice-button ${voiceRecording ? "active" : ""}`}
              onClick={toggleVoiceInput}
              type="button"
              title="使用本地 faster-whisper 实时整句识别"
            >
              <span aria-hidden="true">{voiceRecording ? "■" : "●"}</span>
              {voiceRecording ? "停止输入" : voiceProcessing ? "识别中" : "实时语音"}
            </button>
            <a className="notebook-link" href="https://notebooklm.google.com/" target="_blank" rel="noreferrer" title="打开 NotebookLM 手动转写">
              NotebookLM
            </a>
          </div>
          {(voiceRecording || voiceProcessing || voiceStatus) && <p className="voice-status">{voiceStatus || "正在本地识别..."}</p>}
          {voiceError && <p className="error compact">{voiceError}</p>}
          {transcribeError && <p className="error compact">{transcribeError}</p>}

          <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="输入会议记录、语音转写或口语化流程描述..." />

          <div className="style-picker" aria-label="选择流程图样式">
            {styleOptions.map((style) => (
              <button key={style.id} className={styleId === style.id ? "active" : ""} onClick={() => setStyleId(style.id)} type="button" title={style.description}>
                <span className="style-swatch" style={{ background: style.background, borderColor: style.accent }} />
                <span>{style.id === "origin" ? style.name : `${style.id}. ${style.name}`}</span>
              </button>
            ))}
          </div>

          <button className="primary" onClick={handleGenerate} disabled={loading || transcript.trim().length < 2}>
            {loading ? "正在生成流程图..." : "生成流程图"}
          </button>
          {error && <p className="error">{error}</p>}
        </aside>

        <section className="preview-pane">
          <div className="pane-header">
            <div>
              <p className="section-kicker">Preview</p>
              <h2>{result?.flow.title || "等待生成"}</h2>
            </div>
            <div className="preview-controls">
              <div className="toggle" aria-label="查看方式">
                <button className={previewZoomMode === "fit" ? "active" : ""} onClick={() => setPreviewZoomMode("fit")} disabled={!result}>
                  完整
                </button>
                <button className={previewZoomMode === "readable" ? "active" : ""} onClick={() => setPreviewZoomMode("readable")} disabled={!result}>
                  清晰
                </button>
              </div>
              <div className="toggle" aria-label="预览格式">
                <button className={previewMode === "svg" ? "active" : ""} onClick={() => setPreviewMode("svg")} disabled={!result}>
                  SVG
                </button>
                <button className={previewMode === "png" ? "active" : ""} onClick={() => setPreviewMode("png")} disabled={!pngDataUrl}>
                  PNG
                </button>
              </div>
            </div>
          </div>

          {result && (
            <div className="metrics">
              <span>样式：{result.style.name}</span>
              <span>渲染：Fireworks SVG</span>
              <span>节点：{result.scene.nodeCount}</span>
              <span>连线：{result.scene.edgeCount}</span>
            </div>
          )}

          <div className={`canvas ${previewZoomMode === "readable" ? "readable" : ""}`} ref={canvasRef}>
            {!result && <div className="empty">生成后会在这里展示最终流程图。样式、布局和箭头路由会按当前选择渲染。</div>}
            {result && (
              <div className="fit-preview" style={fittedPreviewStyle}>
                <div className="fit-preview-inner" style={previewInnerStyle}>
                  {previewMode === "svg" && <div className="svg-preview" dangerouslySetInnerHTML={{ __html: result.preview.svg }} />}
                  {previewMode === "png" && pngDataUrl && <img src={pngDataUrl} alt="流程图 PNG 预览" />}
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className="downloads">
              <button onClick={() => downloadText(result.downloads.drawio.filename, result.downloads.drawio.content, "application/xml")}>下载 Draw.io</button>
              <button onClick={() => downloadText(result.downloads.svg.filename, result.downloads.svg.content, "image/svg+xml")}>下载 SVG</button>
              <button onClick={handleDownloadPng} disabled={!pngDataUrl}>
                下载 PNG
              </button>
            </div>
          )}

          {result ? <p className="hint">当前流程图已完成确定性渲染。</p> : null}

          {result?.warnings?.length ? (
            <div className="warnings">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </section>
      </section>

      <section className="converter-section">
        <div className="pane-header">
          <div>
            <p className="section-kicker">Converters</p>
            <h2>格式转换</h2>
          </div>
        </div>

        <div className="converter-grid">
          <section className="converter-card">
            <div className="pane-header">
              <div>
                <p className="section-kicker">Mermaid</p>
                <h2>Mermaid 转 Draw.io</h2>
              </div>
            </div>
            <textarea className="converter-textarea" value={mermaidInput} onChange={(event) => setMermaidInput(event.target.value)} />
            <button className="primary" onClick={handleMermaidToDrawio} disabled={mermaidInput.trim().length < 2}>
              转换为 Draw.io
            </button>
            {mermaidResult && (
              <div className="converter-output">
                <div className="metrics">
                  <span>节点：{mermaidResult.nodeCount}</span>
                  <span>连线：{mermaidResult.edgeCount}</span>
                </div>
                <textarea className="converter-textarea result" readOnly value={mermaidResult.drawio} />
                <div className="downloads">
                  <button onClick={() => downloadText(mermaidResult.filename, mermaidResult.drawio, "application/xml")}>下载 Draw.io</button>
                  <button onClick={() => copyText(mermaidResult.drawio)}>复制 XML</button>
                </div>
              </div>
            )}
          </section>

          <section className="converter-card">
            <div className="pane-header">
              <div>
                <p className="section-kicker">Draw.io</p>
                <h2>Draw.io 文件转 Mermaid</h2>
              </div>
            </div>
            <label className="file-drop">
              <input type="file" accept=".drawio,.xml,.drawio.xml,application/xml,text/xml" onChange={handleDrawioFileChange} />
              <span>{drawioFileName || "上传 Draw.io 文件（.drawio / .xml）"}</span>
            </label>
            <p className="converter-note">直接选择 draw.io/diagrams.net 保存或导出的 .drawio 文件，系统会读取其中的 mxfile XML 并转换为 Mermaid。</p>
            <button className="primary" onClick={handleDrawioToMermaid} disabled={drawioFileContent.trim().length < 2}>
              转换为 Mermaid
            </button>
            {drawioResult && (
              <div className="converter-output">
                <div className="metrics">
                  <span>节点：{drawioResult.nodeCount}</span>
                  <span>连线：{drawioResult.edgeCount}</span>
                </div>
                <textarea className="converter-textarea result" readOnly value={drawioResult.mermaid} />
                <div className="downloads">
                  <button onClick={() => downloadText(drawioResult.filename, drawioResult.mermaid, "text/plain")}>下载 Mermaid</button>
                  <button onClick={() => copyText(drawioResult.mermaid)}>复制代码</button>
                </div>
              </div>
            )}
          </section>
        </div>

        {convertError && <p className="error">{convertError}</p>}
      </section>
        </>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
