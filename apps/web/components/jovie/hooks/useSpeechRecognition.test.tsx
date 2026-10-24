import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranscriberCallbacks } from '@/lib/chat/transcriber';
import type { AdaptiveTranscriberOptions } from '@/lib/dictation/adaptive-transcriber';

const state = vi.hoisted(() => ({
  electron: false,
  desktopSupported: true,
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
    supported: state.desktopSupported,
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
  state.desktopSupported = true;
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
      'elevenlabs-batch',
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
  it('offers streaming in Electron and shows macOS guidance only after the complete ladder is exhausted', () => {
    state.electron = true;
    const { result } = renderHook(() =>
      useSpeechRecognition({ onTranscript() {} })
    );
    expect(result.current.isSupported).toBe(true);
    expect(result.current.unavailableHint).toBeNull();
    expect(state.options?.runtime).toBe('electron');
    act(() => result.current.start());
    expect(result.current.unavailableHint).toBeNull();
    act(() => {
      state.options?.onFallback?.('dictation_cap_reached');
      state.callbacks?.onError?.('network');
      state.callbacks?.onEnd?.();
    });
    expect(result.current.isSupported).toBe(false);
    expect(result.current.unavailableHint).toContain('macOS dictation');
    expect(result.current.error).toBeNull();
  });
  it('keeps Electron permission errors on the permission path, without a system hint', () => {
    state.electron = true;
    const { result } = renderHook(() =>
      useSpeechRecognition({ onTranscript() {} })
    );
    act(() => result.current.start());
    act(() => state.callbacks?.onError?.('not-allowed'));
    expect(result.current.error).toBe('not-allowed');
    expect(result.current.unavailableHint).toBeNull();
  });
  it('does not show the macOS fallback while the desktop capability probe is pending', () => {
    state.electron = true;
    state.desktopSupported = false;
    const { result, rerender } = renderHook(() =>
      useSpeechRecognition({ onTranscript() {} })
    );
    expect(result.current.isSupported).toBe(false);
    expect(result.current.unavailableHint).toBeNull();
    state.desktopSupported = true;
    rerender();
    expect(result.current.isSupported).toBe(true);
    expect(result.current.unavailableHint).toBeNull();
  });
});
