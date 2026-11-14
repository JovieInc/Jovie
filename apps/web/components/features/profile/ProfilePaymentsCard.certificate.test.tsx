import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfilePaymentsCard } from './ProfilePaymentsCard';

const ACCENT = { accent: 'ion', strength: 'text' } as const;
const VENMO = 'https://venmo.com/u/timwhite';

afterEach(() => {
  // @ts-expect-error test cleanup of the injected pixel
  delete globalThis.joviePixel;
});

describe('ProfilePaymentsCard certificate', () => {
  it('chooses an amount with the keyboard and pointer and keeps it across rerenders', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
      />
    );

    await user.click(screen.getByRole('radio', { name: '$20' }));
    expect(screen.getByRole('radio', { name: '$20' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '$20' })).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '$10' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '$10' })).toHaveFocus();

    rerender(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
      />
    );
    expect(screen.getByRole('radio', { name: '$10' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '$10' })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Pay $10' })).toHaveAttribute(
      'href',
      `${VENMO}?txn=pay&amount=10`
    );
    await expectNoA11yViolations(container);
  });

  it('fires the payment pixel when the visitor hands off to Venmo', async () => {
    const user = userEvent.setup();
    const trackPixel = vi.fn();
    // @ts-expect-error injected pixel
    globalThis.joviePixel = { track: trackPixel };
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
    await user.click(screen.getByRole('radio', { name: '$7' }));
    const cta = screen.getByRole('link', { name: 'Pay $7' });
    cta.addEventListener('click', event => event.preventDefault());
    await user.click(cta);
    expect(trackPixel).toHaveBeenCalledWith('tip_intent', {
      tipAmount: 7,
      tipMethod: 'venmo',
    });
  });

  it('keeps chips inert in preview mode and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
        renderMode='preview'
      />
    );

    await user.click(screen.getByRole('radio', { name: '$5' }));
    expect(screen.getByRole('radio', { name: '$10' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '$5' })).not.toBeChecked();
    await expectNoA11yViolations(container);
  });

  it('shows only the CTA when no amounts are offered', async () => {
    const { container } = render(
      <ProfilePaymentsCard
        artistName='Tim White'
        venmoLink={VENMO}
        accent={ACCENT}
        amounts={[]}
      />
    );

    const group = screen.getByRole('group', { name: 'Payment amount' });
    expect(within(group).queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Pay $10' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps a long right-to-left artist name axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfilePaymentsCard
          artistName='فرقة منتصف الليل والأصدقاء'
          venmoLink={VENMO}
          accent={ACCENT}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'Pay فرقة منتصف الليل والأصدقاء' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
