class LivePcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sourceSampleRate = sampleRate;
    this.targetSampleRate = 16000;
    this.frameSamples = 1600;
    this.pending = [];
    this.pendingLength = 0;
    this.fractionalOffset = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "config" && Number.isFinite(event.data.targetSampleRate)) {
        this.targetSampleRate = event.data.targetSampleRate;
        this.frameSamples = Math.max(320, Math.round(this.targetSampleRate / 10));
      }
    };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;
    const ratio = this.sourceSampleRate / this.targetSampleRate;
    const outputLength = Math.floor((input.length - this.fractionalOffset) / ratio);
    if (outputLength <= 0) return true;

    const samples = new Int16Array(outputLength);
    let sourceIndex = this.fractionalOffset;
    for (let index = 0; index < outputLength; index += 1) {
      const value = Math.max(-1, Math.min(1, input[Math.floor(sourceIndex)] || 0));
      samples[index] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
      sourceIndex += ratio;
    }
    this.fractionalOffset = sourceIndex - input.length;
    this.enqueue(samples);
    return true;
  }

  enqueue(samples) {
    this.pending.push(samples);
    this.pendingLength += samples.length;
    while (this.pendingLength >= this.frameSamples) {
      const frame = new Int16Array(this.frameSamples);
      let offset = 0;
      while (offset < frame.length) {
        const first = this.pending[0];
        const remaining = frame.length - offset;
        if (first.length <= remaining) {
          frame.set(first, offset);
          offset += first.length;
          this.pending.shift();
          this.pendingLength -= first.length;
        } else {
          frame.set(first.subarray(0, remaining), offset);
          this.pending[0] = first.subarray(remaining);
          this.pendingLength -= remaining;
          offset = frame.length;
        }
      }
      this.port.postMessage(frame.buffer, [frame.buffer]);
    }
  }
}

registerProcessor("live-pcm-processor", LivePcmProcessor);
