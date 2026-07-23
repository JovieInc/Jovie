import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { CanvasView } from '@/app/exp/shell-v1/shell-v1-types';
import { useShellHotkeys } from '@/app/exp/shell-v1/useShellHotkeys';

function useHotkeyHarness() {
  const [barCollapsed, setBarCollapsed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [jovieListening, setJovieListening] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'docked' | 'floating'>(
    'docked'
  );
  const [view, setView] = useState<CanvasView>('demo');
  const [waveformOn, setWaveformOn] = useState(true);

  useShellHotkeys({
    setBarCollapsed,
    setIsPlaying,
    setJovieListening,
    setSidebarMode,
    setView,
    setWaveformOn,
    view,
  });

  return {
    barCollapsed,
    isPlaying,
    jovieListening,
    sidebarMode,
    view,
    waveformOn,
  };
}

function press(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent('keydown', init));
}

describe('shell-v1 global hotkeys', () => {
  it('preserves playback, chrome, waveform, lyrics, and push-to-talk controls', () => {
    const { result } = renderHook(useHotkeyHarness);

    act(() => press({ code: 'Space', key: ' ' }));
    expect(result.current.isPlaying).toBe(false);

    act(() => press({ key: '[' }));
    expect(result.current.sidebarMode).toBe('floating');

    act(() => press({ key: '`' }));
    expect(result.current.barCollapsed).toBe(true);

    act(() => press({ key: 'w' }));
    expect(result.current.waveformOn).toBe(false);

    act(() => press({ key: 'l' }));
    expect(result.current.view).toBe('lyrics');

    act(() => press({ key: 'Escape' }));
    expect(result.current.view).toBe('demo');

    act(() => press({ key: 'j', metaKey: true }));
    expect(result.current.jovieListening).toBe(true);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'j' }));
    });
    expect(result.current.jovieListening).toBe(false);
  });

  it('ignores playback shortcuts while a text field has focus', () => {
    const { result } = renderHook(useHotkeyHarness);
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          code: 'Space',
          key: ' ',
        })
      );
    });

    expect(result.current.isPlaying).toBe(true);
    input.remove();
  });
});
