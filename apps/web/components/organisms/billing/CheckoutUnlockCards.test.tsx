import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it('hands the live URL to native share when pressed, without axe violations', async () => {
    const onNativeShare = vi.fn();
    const { container } = render(
      <CheckoutUnlockCards
        {...base}
        canNativeShare
        onNativeShare={onNativeShare}
      />
    );
    const share = screen.getByRole('button', { name: /share/i });
    await userEvent.click(share);
    expect(onNativeShare).toHaveBeenCalledWith('https://jov.ie/artist');
    await expectNoA11yViolations(container);
  });

  it('aligns card copy to the reading start so RTL pages do not flush left', () => {
    render(<CheckoutUnlockCards {...base} />);
    for (const id of ['paid-share-prompt', 'paid-unlock-fan-list']) {
      const body = screen.getByTestId(id).firstElementChild;
      expect(body).toHaveClass('text-start');
      expect(body).not.toHaveClass('text-left');
    }
  });
});
