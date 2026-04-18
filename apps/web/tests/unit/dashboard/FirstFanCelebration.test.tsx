import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockTrack = vi.fn();

vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

vi.mock('@/components/atoms/Confetti', () => ({
  ConfettiOverlay: () => <div data-testid='confetti-overlay' />,
}));

import { FirstFanCelebration } from '@/features/dashboard/molecules/FirstFanCelebration';

describe('FirstFanCelebration', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Mock HTMLDialogElement.showModal since jsdom doesn't support it
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
  });

  it('does NOT render when subscriberCount is 0', () => {
    const { container } = render(
      <FirstFanCelebration subscriberCount={0} userId={userId} />
    );
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('does NOT render when subscriberCount > 5', () => {
    const { container } = render(
      <FirstFanCelebration subscriberCount={6} userId={userId} />
    );
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('renders celebration dialog when subscriberCount is 1', () => {
    render(<FirstFanCelebration subscriberCount={1} userId={userId} />);
    expect(
      screen.getByText('Your first fan just subscribed!')
    ).toBeInTheDocument();
  });

  it('does NOT render if localStorage key already set', () => {
    localStorage.setItem(`jovie:first-fan-celebrated:${userId}`, '1');
    const { container } = render(
      <FirstFanCelebration subscriberCount={1} userId={userId} />
    );
    expect(container.querySelector('dialog')).toBeNull();
  });

  it('sets localStorage key on dismiss', () => {
    render(<FirstFanCelebration subscriberCount={1} userId={userId} />);
    const dismissBtn = screen.getByText('Dismiss');
    dismissBtn.click();
    expect(localStorage.getItem(`jovie:first-fan-celebrated:${userId}`)).toBe(
      '1'
    );
  });

  it("tracks 'first_fan_celebration_shown' event", () => {
    render(<FirstFanCelebration subscriberCount={1} userId={userId} />);
    expect(mockTrack).toHaveBeenCalledWith('first_fan_celebration_shown', {
      subscriberCount: 1,
    });
  });
});
