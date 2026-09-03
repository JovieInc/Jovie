import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { YoutubeThumbnailCheckoutClient } from './YoutubeThumbnailCheckoutClient';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({
    mutate: mocks.mutate,
    isPending: false,
    error: null,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

describe('YoutubeThumbnailCheckoutClient', () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.searchParams = new URLSearchParams();
  });

  it('starts only the product-specific founder checkout', () => {
    render(<YoutubeThumbnailCheckoutClient priceId='price_founder' />);

    fireEvent.click(
      screen.getByRole('button', { name: /continue to stripe/i })
    );

    expect(mocks.mutate).toHaveBeenCalledWith(
      { priceId: 'price_founder', source: 'youtube_thumbnails' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('fails closed when the founder price is not configured', async () => {
    const { container } = render(
      <YoutubeThumbnailCheckoutClient priceId={null} />
    );

    expect(
      screen.getByText('Founder checkout is temporarily unavailable.')
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /continue to stripe/i })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('reserves the checkout geometry across pending and resolved states', () => {
    const { container } = render(
      <YoutubeThumbnailCheckoutClient priceId='price_founder' />
    );

    expect(container.firstElementChild).toHaveClass('min-h-[28rem]');
  });

  it('makes a cancelled checkout explicitly non-destructive', () => {
    mocks.searchParams = new URLSearchParams('checkout=cancel');

    render(<YoutubeThumbnailCheckoutClient priceId='price_founder' />);

    expect(
      screen.getByText('Checkout was cancelled. Nothing was charged.')
    ).toBeVisible();
  });
});
