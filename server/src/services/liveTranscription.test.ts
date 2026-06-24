import { describe, expect, it } from "vitest";
import { createEnergyVad, encodePcm16Wav } from "./liveTranscription.js";

function pcmWithAmplitude(sampleCount: number, amplitude: number): Int16Array {
  const samples = new Int16Array(sampleCount);
  const value = Math.round(32767 * amplitude);
  samples.fill(value);
  return samples;
}

describe("energy VAD", () => {
  it("does not emit utterances for silence", () => {
    const vad = createEnergyVad({ sampleRate: 16000, minRms: 0.012, minSpeechMs: 350, endSilenceMs: 800, maxUtteranceMs: 12000 });
    const emitted = vad.push(pcmWithAmplitude(16000, 0), false);
    expect(emitted).toHaveLength(0);
  });

  it("ignores short noise below the minimum speech duration", () => {
    const vad = createEnergyVad({ sampleRate: 16000, minRms: 0.012, minSpeechMs: 350, endSilenceMs: 800, maxUtteranceMs: 12000 });
    const emitted = [
      ...vad.push(pcmWithAmplitude(1600, 0.08), false),
      ...vad.push(pcmWithAmplitude(16000, 0), false)
    ];
    expect(emitted).toHaveLength(0);
  });

  it("emits one utterance after speech followed by enough silence", () => {
    const vad = createEnergyVad({ sampleRate: 16000, minRms: 0.012, minSpeechMs: 350, endSilenceMs: 800, maxUtteranceMs: 12000 });
    const emitted = [
      ...vad.push(pcmWithAmplitude(8000, 0.08), false),
      ...vad.push(pcmWithAmplitude(12800, 0), false)
    ];
    expect(emitted).toHaveLength(1);
    expect(emitted[0].samples.length).toBeGreaterThanOrEqual(8000);
  });

  it("forces an utterance when speech exceeds the maximum duration", () => {
    const vad = createEnergyVad({ sampleRate: 16000, minRms: 0.012, minSpeechMs: 350, endSilenceMs: 800, maxUtteranceMs: 1000 });
    const emitted = vad.push(pcmWithAmplitude(17600, 0.08), false);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].reason).toBe("max-duration");
  });
});

describe("PCM WAV encoding", () => {
  it("writes a 16 kHz mono 16-bit PCM WAV header", () => {
    const wav = encodePcm16Wav(pcmWithAmplitude(1600, 0.05), 16000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.length).toBe(44 + 1600 * 2);
  });
});
