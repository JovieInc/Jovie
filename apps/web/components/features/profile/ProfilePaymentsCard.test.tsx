import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_PAYMENT_AMOUNTS,
  ProfilePaymentsCard,
} from './ProfilePaymentsCard';

const ACCENT = { accent: 'ion', strength: 'text' } as const;
const VENMO = 'https://venmo.com/u/timwhite';

afterEach(() => {
  // @ts-expect-error test cleanup of the injected pixel
  delete globalThis.joviePixel;
});

describe('ProfilePaymentsCard', () => {
  it('offers $5 / $10 / $20 with $10 preselected and a matching Pay CTA', () => {
    render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
      />
    );

    const card = screen.getByTestId('profile-payments-card');
    expect(card).toHaveAttribute('data-accent', 'ion');
    expect(
      within(card).getByRole('heading', { name: 'Pay Tim White' })
    ).toBeInTheDocument();
    expect(PROFILE_PAYMENT_AMOUNTS).toEqual([5, 10, 20]);
    const group = within(card).getByRole('group', { name: 'Payment amount' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map(radio => radio.getAttribute('value'))).toEqual([
      '5',
      '10',
      '20',
    ]);
    expect(within(group).getByRole('radio', { name: '$10' })).toBeChecked();
    const cta = within(card).getByRole('link', { name: 'Pay $10' });
    expect(cta).toHaveAttribute(
      'href',
      `${VENMO}?utm_amount=10&utm_username=timwhite`
    );
    expect(cta).toHaveAttribute('target', '_blank');
    // Generalized payments copy, never "support" or "fund".
    expect(card).not.toHaveTextContent(/support|fund|tip/i);
  });

  it('updates the CTA and hand-off amount when another chip is chosen', () => {
    render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: '$20' }));

    expect(screen.getByRole('radio', { name: '$20' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'Pay $20' })).toHaveAttribute(
      'href',
      `${VENMO}?utm_amount=20&utm_username=timwhite`
    );
  });

  it('fires the tip_intent pixel with the chosen amount on hand-off', () => {
    const trackPixel = vi.fn();
    // @ts-expect-error injected pixel
    globalThis.joviePixel = { track: trackPixel };
    render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
      />
    );

    const cta = screen.getByRole('link', { name: 'Pay $10' });
    cta.addEventListener('click', event => event.preventDefault());
    fireEvent.click(cta);

    expect(trackPixel).toHaveBeenCalledWith('tip_intent', {
      tipAmount: 10,
      tipMethod: 'venmo',
    });
  });

  it('falls back to the first amount when the default is not offered', () => {
    render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
        amounts={[3, 7]}
        defaultAmount={10}
      />
    );

    expect(screen.getByRole('radio', { name: '$3' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'Pay $3' })).toBeInTheDocument();
  });

  it('renders nothing for a missing or unsafe payment link', () => {
    const { container, rerender } = render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={null}
        accent={ACCENT}
      />
    );
    expect(container).toBeEmptyDOMElement();

    rerender(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink='http://venmo.com/u/timwhite'
        accent={ACCENT}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables amount changes and the pixel outside interactive mode', () => {
    const trackPixel = vi.fn();
    // @ts-expect-error injected pixel
    globalThis.joviePixel = { track: trackPixel };
    render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
        renderMode='preview'
      />
    );

    expect(screen.getByRole('radio', { name: '$5' })).toBeDisabled();
    const cta = screen.getByRole('link', { name: 'Pay $10' });
    cta.addEventListener('click', event => event.preventDefault());
    fireEvent.click(cta);
    expect(trackPixel).not.toHaveBeenCalled();
  });
});
