export type VoiceInputSupportEnvironment = {
  isSecureContext?: boolean;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  AudioContext?: typeof AudioContext;
  audioWorkletSupported?: boolean;
  WebSocket?: typeof WebSocket;
};

const lanHostPatterns = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./
];

export function browserVoiceInputEnvironment(): VoiceInputSupportEnvironment {
  return {
    isSecureContext: window.isSecureContext,
    mediaDevices: navigator.mediaDevices,
    AudioContext: window.AudioContext,
    audioWorkletSupported: Boolean(window.AudioContext && window.AudioWorkletNode),
    WebSocket: window.WebSocket
  };
}

function isLanHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && lanHostPatterns.some((pattern) => pattern.test(parsed.hostname));
  } catch {
    return false;
  }
}

function httpsVersion(url: string): string {
  const parsed = new URL(url);
  parsed.protocol = "https:";
  parsed.port = "27300";
  return parsed.origin;
}

export function getVoiceInputSupportError(environment: VoiceInputSupportEnvironment, currentUrl = globalThis.location?.href ?? ""): string {
  if (environment.isSecureContext === false) {
    if (isLanHttpUrl(currentUrl)) {
      return `当前是局域网 HTTP 地址，浏览器会禁止麦克风录音。请使用 mkcert 配置后的 HTTPS 局域网地址访问，例如 ${httpsVersion(currentUrl)}。`;
    }
    return "录音需要 HTTPS 安全访问，或通过 localhost/127.0.0.1 打开。请切换到 HTTPS 地址后重试。";
  }

  if (!environment.mediaDevices?.getUserMedia) {
    return "当前浏览器缺少麦克风访问能力，请使用新版 Chrome 或 Edge。";
  }

  if (!environment.AudioContext || environment.audioWorkletSupported === false) {
    return "当前浏览器缺少实时音频采集能力，请使用新版 Chrome 或 Edge。";
  }

  if (!environment.WebSocket) {
    return "当前浏览器缺少实时连接能力，请使用新版 Chrome 或 Edge。";
  }

  return "";
}

export function voiceInputStartErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "麦克风权限被拒绝。请在浏览器地址栏允许麦克风后重试。";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "没有找到可用麦克风，请连接或启用麦克风后重试。";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "麦克风被其他应用占用，或系统暂时无法读取。请关闭占用麦克风的应用后重试。";
    }
  }

  return error instanceof Error ? error.message : "无法启动本地实时语音输入。";
}
