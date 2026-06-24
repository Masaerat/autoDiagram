export type LiveVoiceStatus = "connected" | "listening" | "speech" | "transcribing" | "idle";

export type LiveVoiceClientOptions = {
  onStatus: (status: LiveVoiceStatus, message: string) => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
};

const targetSampleRate = 16000;
const fallbackStopWaitTimeoutMs = 120000;

function liveTranscriptionUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/transcribe/live`;
}

function statusMessage(status: LiveVoiceStatus): string {
  if (status === "connected") return "实时语音已连接。";
  if (status === "speech") return "已检测到语音，停顿后会自动识别。";
  if (status === "transcribing") return "正在识别刚才的语音...";
  if (status === "idle") return "实时语音已停止。";
  return "正在聆听，停顿后会自动识别整句。";
}

export class LiveVoiceClient {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | null = null;
  private mutedOutput: GainNode | null = null;
  private stopping = false;
  private serverTimeoutMs = fallbackStopWaitTimeoutMs;
  private stopPromise: Promise<void> | null = null;
  private stopResolver: (() => void) | null = null;

  constructor(private readonly options: LiveVoiceClientOptions) {}

  async start(): Promise<void> {
    this.stopping = false;
    this.options.onStatus("connected", "正在请求麦克风权限...");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    this.audioContext = new AudioContext();
    await this.audioContext.audioWorklet.addModule(new URL("./livePcmProcessor.js", import.meta.url));

    const socket = new WebSocket(liveTranscriptionUrl());
    socket.binaryType = "arraybuffer";
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error("实时语音连接失败，请确认后端服务已启动。"));
    });

    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onclose = () => {
      this.resolveStopWaiter();
      if (!this.stopping) this.options.onStatus("idle", "实时语音连接已断开。");
    };
    socket.send(JSON.stringify({ type: "start", sampleRate: targetSampleRate, language: "zh" }));

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = new AudioWorkletNode(this.audioContext, "live-pcm-processor");
    this.processor.port.postMessage({ type: "config", targetSampleRate });
    this.processor.port.onmessage = (event) => {
      const activeSocket = this.socket;
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
      activeSocket.send(event.data);
    };
    this.mutedOutput = this.audioContext.createGain();
    this.mutedOutput.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(this.mutedOutput);
    this.mutedOutput.connect(this.audioContext.destination);
    this.options.onStatus("listening", statusMessage("listening"));
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const socket = this.socket;
    this.processor?.disconnect();
    this.mutedOutput?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.mutedOutput = null;
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    await this.audioContext?.close().catch(() => undefined);
    this.audioContext = null;

    if (socket?.readyState === WebSocket.OPEN) {
      this.stopPromise = new Promise((resolve) => {
        this.stopResolver = resolve;
        window.setTimeout(resolve, this.serverTimeoutMs + 5000);
      });
      socket.send(JSON.stringify({ type: "stop" }));
      await this.stopPromise;
      socket.close(1000, "client stopped");
    } else {
      this.resolveStopWaiter();
    }

    this.socket = null;
    this.options.onStatus("idle", statusMessage("idle"));
  }

  private resolveStopWaiter() {
    this.stopResolver?.();
    this.stopResolver = null;
    this.stopPromise = null;
  }

  private handleMessage(raw: unknown) {
    let message: { type?: unknown; status?: unknown; message?: unknown; text?: unknown; final?: unknown; timeoutMs?: unknown };
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.type === "status") {
      const status = String(message.status || "listening") as LiveVoiceStatus;
      const timeoutMs = Number(message.timeoutMs);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) this.serverTimeoutMs = timeoutMs;
      this.options.onStatus(status, statusMessage(status));
      if (status === "idle") this.resolveStopWaiter();
      return;
    }
    if (message.type === "transcript" && message.final === true) {
      const text = String(message.text || "").trim();
      if (text) this.options.onTranscript(text);
      return;
    }
    if (message.type === "error") {
      this.resolveStopWaiter();
      this.options.onError(String(message.message || "本地语音识别失败。"));
    }
  }
}
