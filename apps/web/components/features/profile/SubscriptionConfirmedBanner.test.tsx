import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionConfirmedBanner } from './SubscriptionConfirmedBanner';

const sourcePath = resolve(__dirname, './SubscriptionConfirmedBanner.tsx');

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

  it('renders nothing when the confirmation query is absent', () => {
    render(<SubscriptionConfirmedBanner />);

    expect(screen.queryByText(/Notifications on!/)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('subscription-confirmed-banner-viewport')
    ).not.toBeInTheDocument();
  });

  it('overlays the confirmation out of flow through auto-dismissal', async () => {
    // Regression (JOV-6454): the banner used to render an in-flow spacing
    // wrapper after first paint, pushing the profile down and pulling it
    // back up on dismissal — two layout shifts on the post-subscribe visit.
    window.history.replaceState({}, '', '/tim?subscribed=confirmed');
    render(
      <div>
        <p>Profile</p>
        <SubscriptionConfirmedBanner />
      </div>
    );

    await act(async () => {});

    const viewport = screen.getByTestId(
      'subscription-confirmed-banner-viewport'
    );
    expect(viewport.className).toContain('absolute');
    expect(viewport.className).toContain('pointer-events-none');
    expect(document.querySelector('.shrink-0.pb-3')).not.toBeInTheDocument();

    const banner = screen.getByTestId('subscription-confirmed-banner');
    expect(banner).toHaveAttribute('data-variant', 'success');
    expect(banner.className).toContain('pointer-events-auto');
    expect(banner.className).toContain('bg-success-subtle');
    expect(banner.className).not.toMatch(/bg-green-|border-green-|text-green-/);

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText(/Notifications on!/)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('subscription-confirmed-banner-viewport')
    ).not.toBeInTheDocument();
    expect(document.querySelector('.shrink-0.pb-3')).not.toBeInTheDocument();
  });

  it('keeps the source on the canonical banner instead of raw green palette classes', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain('Banner');
    expect(source).not.toMatch(/bg-green-|border-green-|text-green-/);
  });
});
