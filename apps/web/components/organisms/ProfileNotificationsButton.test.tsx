// Drift T2.1: IconButton alias retirement — callsite migration coverage.
import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileNotificationsButton } from './ProfileNotificationsButton';

describe('ProfileNotificationsButton', () => {
  it('asks for alerts when unsubscribed and calls onClick, axe-clean', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ProfileNotificationsButton
        hasActiveSubscriptions={false}
        notificationsState='idle'
        onClick={onClick}
      />
    );

    const button = screen.getByRole('button', { name: 'Get alerts' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('marks the editing state as pressed and expanded, axe-clean', async () => {
    const buttonRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <ProfileNotificationsButton
        hasActiveSubscriptions={false}
        notificationsState='editing'
        onClick={vi.fn()}
        ariaExpanded
        buttonRef={buttonRef}
      />
    );

    const button = screen.getByRole('button', { name: 'Get alerts' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(buttonRef.current).toBe(button);
    await expectNoA11yViolations(container);
  });

  it.each([
    [{ email: true, sms: true }, 'Subscribed via Email & SMS'],
    [{ email: true, sms: false }, 'Subscribed via Email'],
    [{ email: false, sms: true }, 'Subscribed via SMS'],
    [undefined, 'Subscribed'],
  ])(
    'labels subscribed channels %j as %s on hover',
    async (channels, label) => {
      const user = userEvent.setup();
      const { container } = render(
        <TooltipProvider delayDuration={0}>
          <ProfileNotificationsButton
            hasActiveSubscriptions
            notificationsState='idle'
            onClick={vi.fn()}
            subscribedChannels={channels}
          />
        </TooltipProvider>
      );

      const button = screen.getByRole('button', {
        name: 'Manage notification preferences',
      });
      await user.hover(button);
      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
      await expectNoA11yViolations(container);
    }
  );

  it('stays axe-clean inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ProfileNotificationsButton
          hasActiveSubscriptions={false}
          notificationsState='idle'
          onClick={vi.fn()}
        />
      </div>
    );

    expect(screen.getByRole('button', { name: 'Get alerts' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
