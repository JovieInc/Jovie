/** Mono PCM16; forward every frame so stop cannot strand a buffered syllable. */
class DictationPcmProcessor extends globalThis.AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) {
      const pcm = new Int16Array(channel.length);
      for (let i = 0; i < channel.length; i++) {
        const sample = Math.max(-1, Math.min(1, channel[i]));
        pcm[i] = Math.round(sample * (sample < 0 ? 32768 : 32767));
      }
      this.port.postMessage(pcm, [pcm.buffer]);
    }
    return true;
  }
}
globalThis.registerProcessor('dictation-pcm', DictationPcmProcessor);
