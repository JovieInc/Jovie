import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YoutubeThumbnailSuccessClient } from './YoutubeThumbnailSuccessClient';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  searchParams: new URLSearchParams('session_id=cs_founder'),
  track: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/analytics', () => ({
  page: vi.fn(),
  track: mocks.track,
}));

describe('YoutubeThumbnailSuccessClient', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.track.mockReset();
    mocks.searchParams = new URLSearchParams('session_id=cs_founder');
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('shows success only after the owned receipt matches the founder price', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ plan: 'pro', priceId: 'price_founder' }),
    });

    render(<YoutubeThumbnailSuccessClient founderPriceId='price_founder' />);

    expect(
      await screen.findByRole('heading', {
        name: 'Your Thumbnail Loop Is Unlocked.',
      })
    ).toBeVisible();
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/billing/checkout-session?session_id=cs_founder',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(mocks.track).toHaveBeenCalledWith('subscription_success', {
      flow_type: 'youtube_thumbnails_founder',
    });
  });

  it('fails closed when the receipt belongs to another price', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ plan: 'pro', priceId: 'price_other_pro' }),
    });

    render(<YoutubeThumbnailSuccessClient founderPriceId='price_founder' />);

    expect(
      await screen.findByRole('heading', {
        name: 'Checkout Confirmation Pending',
      })
    ).toBeVisible();
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
