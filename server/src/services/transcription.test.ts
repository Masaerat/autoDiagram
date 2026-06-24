import { describe, expect, it } from "vitest";
import {
  localTranscribeConfig,
  normalizeScriptError,
  parseTranscriptionStdout,
  sanitizeUploadFilename,
  validateTranscribeFilename
} from "./transcription.js";

describe("transcription service helpers", () => {
  it("uses offline base model for local transcription by default", () => {
    const previous = {
      model: process.env.TRANSCRIBE_MODEL,
      offline: process.env.TRANSCRIBE_OFFLINE,
      vadFilter: process.env.TRANSCRIBE_VAD_FILTER,
      worker: process.env.TRANSCRIBE_WORKER
    };
    delete process.env.TRANSCRIBE_MODEL;
    delete process.env.TRANSCRIBE_OFFLINE;
    delete process.env.TRANSCRIBE_VAD_FILTER;
    delete process.env.TRANSCRIBE_WORKER;
    expect(localTranscribeConfig()).toMatchObject({ model: "base", offline: true, vadFilter: false, worker: true, language: "zh" });
    process.env.TRANSCRIBE_MODEL = previous.model;
    process.env.TRANSCRIBE_OFFLINE = previous.offline;
    process.env.TRANSCRIBE_VAD_FILTER = previous.vadFilter;
    process.env.TRANSCRIBE_WORKER = previous.worker;
  });

  it("can disable the persistent local transcription worker", () => {
    const previous = process.env.TRANSCRIBE_WORKER;
    process.env.TRANSCRIBE_WORKER = "0";
    expect(localTranscribeConfig()).toMatchObject({ worker: false });
    process.env.TRANSCRIBE_WORKER = previous;
  });

  it("accepts supported audio and video filenames", () => {
    expect(validateTranscribeFilename("meeting.mp3")).toBe(".mp3");
    expect(validateTranscribeFilename("demo.video.MP4")).toBe(".mp4");
  });

  it("rejects unsupported filenames with a readable error", () => {
    expect(() => validateTranscribeFilename("notes.txt")).toThrow("不支持的文件格式");
  });

  it("sanitizes uploaded filenames from headers", () => {
    expect(sanitizeUploadFilename(encodeURIComponent("../会议录音.mp3"))).toBe("会议录音.mp3");
    expect(sanitizeUploadFilename("C:\\temp\\clip.wav")).toBe("clip.wav");
  });

  it("parses JSON transcription output", () => {
    const parsed = parseTranscriptionStdout(JSON.stringify({ text: "客户提交申请", duration: 3.2, language: "zh" }));
    expect(parsed).toEqual({ text: "客户提交申请", duration: 3.2, language: "zh" });
  });

  it("normalizes Chinese transcription output to simplified characters", () => {
    const parsed = parseTranscriptionStdout(JSON.stringify({ text: "客戶提交申請，等待後續處理與審核。", duration: 3.2, language: "zh" }));
    expect(parsed.text).toBe("客户提交申请，等待后续处理与审核。");
  });

  it("rejects empty transcription output", () => {
    expect(() => parseTranscriptionStdout("   ")).toThrow("没有返回文字");
  });

  it("explains missing offline local model cache", () => {
    const message = normalizeScriptError("LocalEntryNotFoundError: cannot find an appropriate cached snapshot folder");
    expect(message).toContain("Systran/faster-whisper-base");
  });

  it("explains how to fix missing onnxruntime for VAD", () => {
    const message = normalizeScriptError("Applying the VAD filter requires the onnxruntime package");
    expect(message).toContain("TRANSCRIBE_VAD_FILTER=0");
  });
});
