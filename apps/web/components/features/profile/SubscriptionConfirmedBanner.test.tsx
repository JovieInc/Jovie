import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionConfirmedBanner } from './SubscriptionConfirmedBanner';

describe('SubscriptionConfirmedBanner', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/tim');
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.history.replaceState({}, '', '/');
  });

  it('does not reserve layout space when the confirmation query is absent', () => {
    render(<SubscriptionConfirmedBanner />);

    expect(screen.queryByText(/Notifications on!/)).not.toBeInTheDocument();
    expect(document.querySelector('.shrink-0.pb-3')).not.toBeInTheDocument();
  });

  it('adds its spacing wrapper only while the confirmation is visible', async () => {
    window.history.replaceState({}, '', '/tim?subscribed=confirmed');
    render(<SubscriptionConfirmedBanner />);

    await act(async () => {});
    const message = screen.getByText(/Notifications on!/);
    expect(message.closest('.shrink-0.pb-3')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText(/Notifications on!/)).not.toBeInTheDocument();
    expect(document.querySelector('.shrink-0.pb-3')).not.toBeInTheDocument();
  });
});
