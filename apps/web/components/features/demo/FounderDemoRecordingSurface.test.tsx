import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  ThreadView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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

  it('shows the approval step mid-demo and keeps it on press', async () => {
    motionPreference.reduced = false;
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    let frames = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames += 1;
      if (frames === 1) {
        now.mockReturnValue(50_000);
        callback(0);
      }
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const user = userEvent.setup();
    const { container } = render(<FounderDemoRecordingSurface />);

    const approve = await screen.findByRole('button', { name: 'Approve drop' });
    expect(approve.className).not.toContain('bg-white');
    await user.click(approve);

    expect(
      screen.getByRole('button', { name: 'Approve drop' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
