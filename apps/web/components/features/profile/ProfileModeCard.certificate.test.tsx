import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileModeCard, ProfileModeCardAction } from './ProfileModeCard';

const ACCENT = { accent: 'orange', strength: 'text' } as const;

describe('ProfileModeCard: certificate states', () => {
  it('has no axe violations with the eyebrow only', async () => {
    const { container } = render(
      <ProfileModeCard accent={ACCENT} eyebrow='Events' dataTestId='card' />
    );
    const card = screen.getByRole('region', { name: 'Events' });
    expect(within(card).queryByRole('heading')).toBeNull();
    expect(card.querySelector('p')).toBeNull();
    expect(card).toHaveTextContent('Events');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations with a title and no description', async () => {
    const { container } = render(
      <ProfileModeCard
        accent={ACCENT}
        eyebrow='Listen'
        title='Never Say A Word'
      />
    );
    const card = screen.getByRole('region', { name: 'Listen' });
    expect(
      within(card).getByRole('heading', { level: 2, name: 'Never Say A Word' })
    ).toBeInTheDocument();
    expect(card.querySelector('p')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('truncates long eyebrow and title text instead of growing the card', async () => {
    const eyebrow =
      'Stay close with weekly notes, tour dates and early releases from the studio';
    const title =
      'Stay in touch with Tim White and the whole Never Say A Word touring band';
    const { container } = render(
      <ProfileModeCard
        accent={ACCENT}
        eyebrow={eyebrow}
        title={title}
        description='Notes from Tim White, straight to your inbox: new music the moment it lands and tour dates near you before they go on sale.'
      >
        <ProfileModeCardAction href='/timwhite/alerts'>
          Get alerts for new music, tour dates and studio notes
        </ProfileModeCardAction>
      </ProfileModeCard>
    );
    const card = screen.getByRole('region', { name: eyebrow });
    expect(within(card).getByText(eyebrow)).toHaveClass('truncate', 'min-w-0');
    expect(within(card).getByRole('heading', { name: title })).toHaveClass(
      'truncate',
      'min-w-0'
    );
    expect(
      within(card).getByRole('link', {
        name: 'Get alerts for new music, tour dates and studio notes',
      })
    ).toHaveClass('h-11', 'w-full');
    await expectNoA11yViolations(container);
  });

  it('has no axe violations right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ProfileModeCard
          accent={ACCENT}
          eyebrow='ابق على تواصل'
          title='ابق على اتصال مع تيم وايت'
          description='ملاحظات من تيم وايت مباشرة إلى بريدك الوارد.'
        >
          <ProfileModeCardAction href='/timwhite/alerts'>
            احصل على التنبيهات
          </ProfileModeCardAction>
        </ProfileModeCard>
      </div>
    );
    expect(
      screen.getByRole('region', { name: 'ابق على تواصل' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('runs the action handler from a click and from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event: { preventDefault: () => void }) =>
      event.preventDefault()
    );
    render(
      <ProfileModeCard accent={ACCENT} eyebrow='Pay' title='Support Tim'>
        <ProfileModeCardAction
          href='https://venmo.com/u/tim'
          external
          onClick={onClick}
          ariaLabel='Pay Tim White $10'
        >
          Pay $10
        </ProfileModeCardAction>
      </ProfileModeCard>
    );
    const action = screen.getByRole('link', { name: 'Pay Tim White $10' });
    await user.click(action);
    expect(onClick).toHaveBeenCalledTimes(1);
    action.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('keeps an eyebrow aside control reachable and labelled', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { container } = render(
      <ProfileModeCard
        accent={ACCENT}
        eyebrow='Stay close'
        title='Stay in touch'
        eyebrowAside={
          <button type='button' aria-label='Dismiss' onClick={onDismiss}>
            x
          </button>
        }
      />
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
