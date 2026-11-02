import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutUnlockCards } from './CheckoutUnlockCards';

const base = {
  shareUrl: 'https://jov.ie/artist',
  showFanListExport: true,
  canNativeShare: false,
  onNativeShare: vi.fn(),
};

describe('CheckoutUnlockCards', () => {
  it('leads with sharing the live page, then the export the plan secures', () => {
    render(<CheckoutUnlockCards {...base} />);
    expect(screen.getByTestId('paid-share-prompt')).toHaveTextContent(
      'Share your page to collect your first fans'
    );
    expect(screen.getByTestId('paid-unlock-fan-list')).toHaveTextContent(
      /You're on .+: unlocked/
    );
  });

  it('shows no share card without a live page and no export without a profile', () => {
    render(
      <CheckoutUnlockCards
        {...base}
        shareUrl={null}
        showFanListExport={false}
      />
    );
    expect(screen.queryByTestId('paid-share-prompt')).toBeNull();
    expect(screen.queryByTestId('paid-unlock-fan-list')).toBeNull();
  });
});
