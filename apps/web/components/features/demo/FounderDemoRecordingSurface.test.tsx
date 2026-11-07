import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FounderDemoRecordingSurface } from './FounderDemoRecordingSurface';

const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => motionPreference.reduced,
}));
vi.mock('@/features/demo/DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/demo/DemoReleasesExperience', () => ({
  DemoReleasesExperience: () => null,
}));
vi.mock('@/features/demo/DemoTimWhiteProfileSurface', () => ({
  DemoTimWhiteProfileSurface: () => null,
}));
vi.mock('@/components/shell/ThreadView', () => ({
  ThreadView: () => null,
}));
vi.mock('@/components/jovie/components/ChatInput', () => ({
  ChatInput: () => null,
}));
vi.mock('@/components/jovie/components/ChatMarkdown', () => ({
  ChatMarkdown: () => null,
}));

afterEach(() => vi.restoreAllMocks());

describe('Founder demo reduced motion', () => {
  it('does not start the autoplay loop when motion is reduced', () => {
    motionPreference.reduced = true;
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    render(<FounderDemoRecordingSurface />);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('advances normally and stops its pending frame when reduced motion is enabled', () => {
    motionPreference.reduced = false;
    let tick: FrameRequestCallback | undefined;
    const requestFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        tick = callback;
        return 7;
      });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
    const { rerender } = render(<FounderDemoRecordingSurface />);
    expect(requestFrame).toHaveBeenCalledOnce();
    act(() => tick?.(performance.now()));
    expect(requestFrame).toHaveBeenCalledTimes(2);
    motionPreference.reduced = true;
    rerender(<FounderDemoRecordingSurface />);
    expect(cancelFrame).toHaveBeenCalledWith(7);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });
});
