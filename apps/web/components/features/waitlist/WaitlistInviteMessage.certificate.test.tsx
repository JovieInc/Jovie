import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistInviteMessage } from './WaitlistInviteMessage';
import {
  LongContentCopy,
  RtlArabic,
} from './WaitlistInviteMessage.states.stories';

describe('WaitlistInviteMessage certificate', () => {
  it('keeps the recovery message and waitlist link axe-clean', async () => {
    const { container } = render(
      <WaitlistInviteMessage
        title='Invite link missing'
        body='Open the latest invite email and try again.'
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Invite link missing' })
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Check waitlist status' })
    ).toHaveAttribute('href', APP_ROUTES.WAITLIST);
    await expectNoA11yViolations(container);
  });

  it('keeps long copy whole and axe-clean', async () => {
    const args = LongContentCopy.args as { title: string; body: string };
    const { container } = render(<WaitlistInviteMessage {...args} />);

    expect(screen.getByRole('heading', { name: args.title })).toBeVisible();
    expect(screen.getByText(args.body)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with Arabic copy in a right-to-left document', async () => {
    const args = RtlArabic.args as { title: string; body: string };
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WaitlistInviteMessage {...args} />
      </div>
    );

    expect(screen.getByRole('heading', { name: args.title })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
