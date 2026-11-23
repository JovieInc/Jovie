import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarDockBridge } from '../SidebarDockBridge';
import {
  type AudioTrackSource,
  useTrackAudioPlayer,
} from './useTrackAudioPlayer';

/** Stands in for the browser audio element the store binds to. */
class FakeAudio extends EventTarget {
  static last: FakeAudio | null = null;
  preload = '';
  src = '';
  paused = true;
  currentTime = 0;
  duration = 120;
  constructor() {
    super();
    FakeAudio.last = this;
  }
  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  load() {}
}

const dockRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/shell/SidebarDock', async importOriginal => {
  const original =
    await importOriginal<typeof import('@/components/shell/SidebarDock')>();
  return {
    ...original,
    SidebarDock: (props: Parameters<typeof original.SidebarDock>[0]) => {
      dockRenders.count += 1;
      return <original.SidebarDock {...props} />;
    },
  };
});
vi.mock('@/lib/desktop/electron-bridge', () => ({
  isElectronRuntime: () => false,
}));
vi.mock('@/lib/service-worker/control', () => ({
  isSwEnabled: () => false,
  unregisterServiceWorker: async () => {},
  registerServiceWorker: vi.fn(),
}));

const track: AudioTrackSource = {
  id: 'track-1',
  title: 'Never Say A Word',
  audioUrl: 'https://example.test/a.mp3',
  artistName: 'Tim White',
};

let controls: ReturnType<typeof useTrackAudioPlayer>;
beforeEach(() => {
  vi.stubGlobal('Audio', FakeAudio);
  // `watch: false` is the same no-subscription path the shell dock uses.
  controls = renderHook(() => useTrackAudioPlayer(false)).result.current;
  dockRenders.count = 0;
});
afterEach(() => {
  act(() => controls.stop());
  vi.unstubAllGlobals();
});

function tick(audio: FakeAudio, seconds: number) {
  audio.currentTime = seconds;
  audio.dispatchEvent(new Event('timeupdate'));
}

describe('shell audio selector', () => {
  it('does not re-render the dock bridge on playback progress ticks', async () => {
    const times = vi.spyOn(performance, 'now');
    let clock = 1000;
    times.mockImplementation(() => clock);
    render(<SidebarDockBridge userId='' collapsed={false} />);
    await act(async () => {
      await controls.toggleTrack(track);
    });
    const audio = FakeAudio.last as FakeAudio;
    const afterStart = dockRenders.count;
    expect(afterStart).toBeGreaterThan(0);

    // Twenty progress notifications over five seconds (the store's 4 Hz).
    for (let i = 1; i <= 20; i += 1) {
      clock += 300;
      act(() => tick(audio, i * 0.25));
    }
    expect(dockRenders.count).toBe(afterStart);

    // A selected field still reaches the dock: pausing re-renders it once.
    act(() => audio.pause());
    expect(dockRenders.count).toBeGreaterThan(afterStart);
    times.mockRestore();
  });
});
