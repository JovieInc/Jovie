/** AudioWorklet keeps PCM capture off the renderer thread, without another mic. */
export async function capturePcm(
  mic: MediaStream,
  push: (samples: Int16Array) => void,
  signal: AbortSignal
): Promise<() => void> {
  const context = new AudioContext({ sampleRate: 16000 });
  let source: MediaStreamAudioSourceNode | null = null;
  let worklet: AudioWorkletNode | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    source?.disconnect();
    if (worklet) worklet.port.onmessage = null;
    worklet?.disconnect();
    void context.close().catch(() => {});
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    if (signal.aborted) {
      dispose();
      return dispose;
    }
    if (context.sampleRate !== 16000)
      throw new Error('Unsupported PCM sample rate');
    source = context.createMediaStreamSource(mic);
    await context.audioWorklet.addModule('/dictation-pcm-worklet.js');
    if (signal.aborted) {
      dispose();
      return dispose;
    }
    worklet = new AudioWorkletNode(context, 'dictation-pcm');
    worklet.port.onmessage = (event: MessageEvent<Int16Array>) => {
      if (!signal.aborted && !disposed) push(event.data);
    };
    source.connect(worklet);
    // Processor emits silence; connect to keep the audio graph running.
    worklet.connect(context.destination);
    await context.resume();
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
