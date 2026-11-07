import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePcm } from './pcm-capture';

afterEach(() => vi.unstubAllGlobals());
describe('shared PCM capture', () => {
  it('uses the shared mic at 16 kHz and releases the graph exactly once on cancellation', async () => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const close = vi.fn(async () => {});
    const addModule = vi.fn(async () => {});
    const node = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      port: {
        onmessage: null as ((event: { data: Int16Array }) => void) | null,
      },
    };
    vi.stubGlobal(
      'AudioContext',
      class {
        sampleRate = 16000;
        audioWorklet = { addModule };
        createMediaStreamSource = vi.fn(() => source);
        destination = {};
        close = close;
        resume = vi.fn(async () => {});
      }
    );
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        constructor() {
          return node;
        }
      }
    );
    const controller = new AbortController();
    const push = vi.fn();
    const dispose = await capturePcm(
      {} as MediaStream,
      push,
      controller.signal
    );
    expect(addModule).toHaveBeenCalledWith('/dictation-pcm-worklet.js');
    node.port.onmessage?.({ data: new Int16Array([1, 2]) });
    expect(push).toHaveBeenCalledOnce();
    controller.abort();
    dispose();
    expect(close).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.port.onmessage).toBeNull();
  });
});
