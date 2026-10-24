import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriberCallbacks } from '@/lib/chat/transcriber';
import type { AdaptiveTranscriberOptions } from '@/lib/dictation/adaptive-transcriber';

const state = vi.hoisted(() => ({
  electron: false,
  callbacks: null as TranscriberCallbacks | null,
  options: null as AdaptiveTranscriberOptions | null,
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  pausePlaybackForInterruption: vi.fn(),
  resumePlaybackAfterInterruption: vi.fn(),
}));
vi.mock('@/lib/desktop/electron-bridge', () => ({
  getElectronAPI: () => ({ platform: 'darwin' }),
  isElectronRuntime: () => state.electron,
  useDesktopDictationStatus: () => ({
    webSpeechFallbackAllowed: !state.electron,
  }),
}));
vi.mock('@/lib/dictation/adaptive-transcriber', () => ({
  createAdaptiveTranscriber: (
    callbacks: TranscriberCallbacks,
    options: AdaptiveTranscriberOptions
  ) => {
    state.callbacks = callbacks;
    state.options = options;
    return {
      isSupported: true,
      start: state.start,
      stop: state.stop,
      cancel: state.cancel,
      dispose: state.dispose,
    };
  },
}));

import { useSpeechRecognition } from './useSpeechRecognition';

beforeEach(() => {
  vi.clearAllMocks();
  state.electron = false;
});
describe('composer adaptive dictation', () => {
  it('uses the adaptive providers and preserves final results after stop', () => {
    const receive = vi.fn();
    const { result, unmount } = renderHook(() =>
      useSpeechRecognition({ onTranscript: receive })
    );
    expect(result.current.isSupported).toBe(true);
    expect(state.options?.providers?.map(p => p.id)).toEqual([
      'elevenlabs-stream',
      'web-speech',
    ]);
    act(() => result.current.start());
    expect(result.current.isListening).toBe(true);
    act(() => result.current.stop());
    act(() => state.callbacks?.onTranscript('Final'));
    expect(receive).toHaveBeenCalledWith('Final');
    act(() => state.callbacks?.onEnd?.());
    expect(state.start).toHaveBeenCalledTimes(1);
    unmount();
    expect(state.dispose).toHaveBeenCalled();
  });
  it('does not repopulate the composer after cancel', () => {
    const receive = vi.fn();
    const { result } = renderHook(() =>
      useSpeechRecognition({ onTranscript: receive })
    );
    act(() => result.current.start());
    act(() => result.current.cancel());
    act(() => state.callbacks?.onTranscript('Late'));
    expect(receive).not.toHaveBeenCalled();
    expect(state.cancel).toHaveBeenCalledOnce();
  });
  it('surfaces permission errors without marking fallback exhausted', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ onTranscript() {} })
    );
    act(() => result.current.start());
    act(() => state.callbacks?.onError?.('not-allowed'));
    expect(result.current.error).toBe('not-allowed');
    expect(result.current.isSupported).toBe(true);
    expect(result.current.unavailableHint).toBeNull();
  });
});
