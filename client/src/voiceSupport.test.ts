import { describe, expect, it } from "vitest";
import { getVoiceInputSupportError, type VoiceInputSupportEnvironment } from "./voiceSupport";

function environment(overrides: Partial<VoiceInputSupportEnvironment> = {}): VoiceInputSupportEnvironment {
  return {
    isSecureContext: true,
    mediaDevices: { getUserMedia: () => Promise.resolve({} as MediaStream) },
    AudioContext: class {} as unknown as typeof AudioContext,
    audioWorkletSupported: true,
    WebSocket: class {} as unknown as typeof WebSocket,
    ...overrides
  };
}

describe("voice input browser support", () => {
  it("explains that Chrome or Edge need HTTPS or localhost for microphone recording", () => {
    expect(getVoiceInputSupportError(environment({ isSecureContext: false }))).toBe(
      "录音需要 HTTPS 安全访问，或通过 localhost/127.0.0.1 打开。请切换到 HTTPS 地址后重试。"
    );
  });

  it("explains that LAN HTTP addresses need the HTTPS LAN entry", () => {
    expect(getVoiceInputSupportError(environment({ isSecureContext: false }), "http://192.168.1.20:5173/")).toBe(
      "当前是局域网 HTTP 地址，浏览器会禁止麦克风录音。请使用 mkcert 配置后的 HTTPS 局域网地址访问，例如 https://192.168.1.20:27300。"
    );
  });

  it("points old development HTTP entries at the production HTTPS port", () => {
    expect(getVoiceInputSupportError(environment({ isSecureContext: false }), "http://172.23.17.242:5173/demo")).toBe(
      "当前是局域网 HTTP 地址，浏览器会禁止麦克风录音。请使用 mkcert 配置后的 HTTPS 局域网地址访问，例如 https://172.23.17.242:27300。"
    );
  });

  it("explains when realtime audio capture APIs are unavailable", () => {
    expect(getVoiceInputSupportError(environment({ audioWorkletSupported: false }))).toBe("当前浏览器缺少实时音频采集能力，请使用新版 Chrome 或 Edge。");
  });

  it("explains when realtime connection APIs are unavailable", () => {
    expect(getVoiceInputSupportError(environment({ WebSocket: undefined }))).toBe("当前浏览器缺少实时连接能力，请使用新版 Chrome 或 Edge。");
  });

  it("allows recording when realtime microphone APIs are available", () => {
    expect(getVoiceInputSupportError(environment())).toBe("");
  });
});
