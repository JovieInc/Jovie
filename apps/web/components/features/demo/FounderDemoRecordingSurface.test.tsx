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
  ThreadView: ({ children }: { children: ReactNode }) => <>{children}</>,
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

describe('Founder demo approval step', () => {
  it('shows the Approve drop button mid-timeline and keeps it inert to clicks', async () => {
    const user = userEvent.setup();
    motionPreference.reduced = false;
    let tick: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      tick = callback;
      return 1;
    });
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(0);
    const { container } = render(<FounderDemoRecordingSurface />);

    now.mockReturnValue(50_000);
    act(() => tick?.(50_000));

    const approve = screen.getByRole('button', { name: 'Approve Drop' });
    await user.click(approve);
    expect(approve).toBeInTheDocument();
    expect(approve.className).not.toContain('--linear-btn');
    await expectNoA11yViolations(container);
  });
});
