import { afterEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import { WebSocket } from "ws";

vi.mock("./transcription.js", () => ({
  TranscriptionError: class TranscriptionError extends Error {
    constructor(
      message: string,
      public readonly statusCode = 400
    ) {
      super(message);
    }
  },
  transcribeAudioFile: vi.fn(async () => ({ text: "测试语音", duration: 1, language: "zh" })),
  transcribeTimeoutMs: vi.fn(() => 1000)
}));

const { attachLiveTranscriptionWebSocket } = await import("./liveTranscription.js");

function pcmWithAmplitude(sampleCount: number, amplitude: number): Int16Array {
  const samples = new Int16Array(sampleCount);
  samples.fill(Math.round(32767 * amplitude));
  return samples;
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address) resolve(address.port);
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("live transcription websocket", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (!server) return;
    await closeServer(server);
    server = null;
  });

  it("flushes the final utterance before reporting idle on stop", async () => {
    server = http.createServer();
    attachLiveTranscriptionWebSocket(server);
    const port = await listen(server);
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/transcribe/live`);
    const received: Array<{ type?: string; status?: string; text?: string }> = [];

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        error ? reject(error) : resolve();
      };
      const timeout = setTimeout(() => finish(new Error("timed out waiting for transcript")), 3000);

      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "start", sampleRate: 16000, language: "zh" }));
        socket.send(pcmWithAmplitude(8000, 0.08).buffer);
        socket.send(JSON.stringify({ type: "stop" }));
      });
      socket.on("message", (data) => {
        const message = JSON.parse(String(data)) as { type?: string; status?: string; text?: string };
        received.push(message);
        if (message.type === "status" && message.status === "idle") {
          finish();
        }
      });
      socket.on("error", (error) => finish(error));
    });

    expect(received).toContainEqual(expect.objectContaining({ type: "transcript", text: "测试语音" }));
    const transcriptIndex = received.findIndex((message) => message.type === "transcript");
    const idleIndex = received.findIndex((message) => message.type === "status" && message.status === "idle");
    expect(transcriptIndex).toBeGreaterThan(-1);
    expect(idleIndex).toBeGreaterThan(transcriptIndex);
  });
});
