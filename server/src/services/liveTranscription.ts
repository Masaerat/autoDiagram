import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { TranscriptionError, transcribeAudioFile, transcribeTimeoutMs } from "./transcription.js";

export type EnergyVadConfig = {
  sampleRate: number;
  minRms: number;
  minSpeechMs: number;
  endSilenceMs: number;
  maxUtteranceMs: number;
};

export type VadEmission = {
  samples: Int16Array;
  reason: "silence" | "max-duration" | "flush";
};

const defaultLiveConfig: EnergyVadConfig = {
  sampleRate: 16000,
  minRms: Number(process.env.TRANSCRIBE_LIVE_MIN_RMS || 0.012),
  minSpeechMs: Number(process.env.TRANSCRIBE_LIVE_MIN_SPEECH_MS || 350),
  endSilenceMs: Number(process.env.TRANSCRIBE_LIVE_END_SILENCE_MS || 800),
  maxUtteranceMs: Number(process.env.TRANSCRIBE_LIVE_MAX_UTTERANCE_MS || 12000)
};

function concatInt16(chunks: Int16Array[]): Int16Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Int16Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function rms(samples: Int16Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const normalized = sample / 32768;
    sum += normalized * normalized;
  }
  return Math.sqrt(sum / samples.length);
}

function msToSamples(ms: number, sampleRate: number): number {
  return Math.round((ms / 1000) * sampleRate);
}

export function createEnergyVad(config: EnergyVadConfig = defaultLiveConfig) {
  const minSpeechSamples = msToSamples(config.minSpeechMs, config.sampleRate);
  const endSilenceSamples = msToSamples(config.endSilenceMs, config.sampleRate);
  const maxUtteranceSamples = msToSamples(config.maxUtteranceMs, config.sampleRate);
  const chunks: Int16Array[] = [];
  let speechSamples = 0;
  let trailingSilenceSamples = 0;
  let active = false;

  function reset() {
    chunks.length = 0;
    speechSamples = 0;
    trailingSilenceSamples = 0;
    active = false;
  }

  function emit(reason: VadEmission["reason"]): VadEmission[] {
    if (speechSamples < minSpeechSamples) {
      reset();
      return [];
    }
    const samples = concatInt16(chunks);
    reset();
    return [{ samples, reason }];
  }

  return {
    push(samples: Int16Array, flush = false): VadEmission[] {
      const emitted: VadEmission[] = [];
      if (samples.length > 0) {
        const isSpeech = rms(samples) >= config.minRms;
        if (isSpeech) {
          active = true;
          speechSamples += samples.length;
          trailingSilenceSamples = 0;
          chunks.push(samples);
        } else if (active) {
          trailingSilenceSamples += samples.length;
          chunks.push(samples);
        }
      }

      const bufferedSamples = chunks.reduce((total, chunk) => total + chunk.length, 0);
      if (active && bufferedSamples >= maxUtteranceSamples) emitted.push(...emit("max-duration"));
      else if (active && trailingSilenceSamples >= endSilenceSamples) emitted.push(...emit("silence"));
      else if (flush && active) emitted.push(...emit("flush"));
      return emitted;
    },
    flush(): VadEmission[] {
      return this.push(new Int16Array(), true);
    }
  };
}

export function encodePcm16Wav(samples: Int16Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index], 44 + index * 2);
  }
  return buffer;
}

type LiveServer = http.Server | https.Server;

type LiveClientMessage = {
  type?: unknown;
  sampleRate?: unknown;
  language?: unknown;
};

function sendJson(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function rawDataToInt16(data: RawData): Int16Array {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data as ArrayBuffer)]);
  const samples = new Int16Array(Math.floor(buffer.byteLength / 2));
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2);
  }
  return samples;
}

async function transcribeUtterance(samples: Int16Array, sampleRate: number) {
  const root = path.join(os.tmpdir(), "auto-diagram-live-transcribe");
  await mkdir(root, { recursive: true });
  const wavPath = path.join(root, `${randomUUID()}.wav`);
  try {
    await writeFile(wavPath, encodePcm16Wav(samples, sampleRate));
    return await transcribeAudioFile(wavPath);
  } finally {
    await rm(wavPath, { force: true }).catch(() => undefined);
  }
}

export function attachLiveTranscriptionWebSocket(server: LiveServer) {
  const webSocketServer = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname !== "/api/transcribe/live") return;
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    let sampleRate = defaultLiveConfig.sampleRate;
    let vad = createEnergyVad({ ...defaultLiveConfig, sampleRate });
    let started = false;
    let acceptingAudio = false;
    let closed = false;
    let pending = 0;
    let utteranceIndex = 0;
    let stopInProgress: Promise<void> | null = null;
    const activeTranscriptions = new Set<Promise<void>>();

    async function handleEmission(emission: VadEmission) {
      if (pending >= 2) {
        sendJson(socket, { type: "error", message: "语音识别积压过多，请稍后重试。" });
        socket.close(1013, "transcription backlog");
        return;
      }
      pending += 1;
      const utteranceId = String(++utteranceIndex);
      sendJson(socket, { type: "status", status: "transcribing", utteranceId, reason: emission.reason });
      try {
        const result = await transcribeUtterance(emission.samples, sampleRate);
        if (result.text.trim()) sendJson(socket, { type: "transcript", text: result.text, final: true, utteranceId });
      } catch (error) {
        const message = error instanceof TranscriptionError || error instanceof Error ? error.message : "本地语音识别失败。";
        sendJson(socket, { type: "error", message });
      } finally {
        pending = Math.max(0, pending - 1);
        if (!closed && acceptingAudio) sendJson(socket, { type: "status", status: "listening" });
      }
    }

    function queueEmission(emission: VadEmission): Promise<void> {
      const transcription = handleEmission(emission);
      activeTranscriptions.add(transcription);
      void transcription.finally(() => activeTranscriptions.delete(transcription));
      return transcription;
    }

    async function flushAndIdle() {
      if (stopInProgress) return stopInProgress;
      acceptingAudio = false;
      stopInProgress = (async () => {
        const flushed = vad.flush().map((emission) => queueEmission(emission));
        await Promise.all([...activeTranscriptions, ...flushed]);
        if (!closed) sendJson(socket, { type: "status", status: "idle" });
      })();
      return stopInProgress;
    }

    socket.on("message", (data, isBinary) => {
      if (!isBinary) {
        let message: LiveClientMessage;
        try {
          message = JSON.parse(data.toString()) as LiveClientMessage;
        } catch {
          sendJson(socket, { type: "error", message: "实时语音消息格式无效。" });
          return;
        }
        if (message.type === "start") {
          const requestedSampleRate = Number(message.sampleRate);
          sampleRate = Number.isFinite(requestedSampleRate) && requestedSampleRate > 0 ? requestedSampleRate : defaultLiveConfig.sampleRate;
          vad = createEnergyVad({ ...defaultLiveConfig, sampleRate });
          started = true;
          acceptingAudio = true;
          stopInProgress = null;
          sendJson(socket, { type: "status", status: "listening", timeoutMs: transcribeTimeoutMs() });
          return;
        }
        if (message.type === "stop") {
          void flushAndIdle();
          return;
        }
        return;
      }

      if (!started) {
        sendJson(socket, { type: "error", message: "实时语音连接尚未初始化。" });
        return;
      }
      if (!acceptingAudio) return;
      const samples = rawDataToInt16(data);
      const emissions = vad.push(new Int16Array(samples));
      if (emissions.length === 0) {
        sendJson(socket, { type: "status", status: "listening" });
        return;
      }
      for (const emission of emissions) void queueEmission(emission);
    });

    socket.on("close", () => {
      closed = true;
      acceptingAudio = false;
      void Promise.all(vad.flush().map((emission) => queueEmission(emission)));
    });

    sendJson(socket, { type: "status", status: "connected" });
  });

  return webSocketServer;
}
