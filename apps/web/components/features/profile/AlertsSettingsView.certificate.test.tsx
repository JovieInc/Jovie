import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { NotificationContentType } from '@/types/notifications';
import { AlertsSettingsView } from './AlertsSettingsView';

const contentPrefs: Record<NotificationContentType, boolean> = {
  newMusic: true,
  tourDates: false,
  merch: false,
  general: false,
};

function renderView(
  props: Partial<Parameters<typeof AlertsSettingsView>[0]> = {}
) {
  const onTogglePref = vi.fn<(key: NotificationContentType) => void>();
  const onUnsubscribe = vi.fn();
  const view = render(
    <AlertsSettingsView
      isSubscribed
      contentPrefs={contentPrefs}
      onTogglePref={onTogglePref}
      onUnsubscribe={onUnsubscribe}
      isUnsubscribing={false}
      {...props}
    />
  );
  return { ...view, onTogglePref, onUnsubscribe };
}

describe('AlertsSettingsView certificate', () => {
  it('toggles a topic and turns alerts off from the panel', async () => {
    const user = userEvent.setup();
    const { container, onTogglePref, onUnsubscribe } = renderView();

    expect(screen.getByRole('heading', { name: 'Alerts' })).toBeVisible();
    expect(screen.getByText('On')).toBeVisible();

    await user.click(screen.getByRole('switch', { name: 'Events' }));
    expect(onTogglePref).toHaveBeenCalledWith('tourDates');

    await user.click(screen.getByRole('button', { name: 'Turn off alerts' }));
    expect(onUnsubscribe).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('disables the turn-off action while alerts are turning off', async () => {
    const user = userEvent.setup();
    const { onUnsubscribe } = renderView({ isUnsubscribing: true });

    const turningOff = screen.getByRole('button', { name: 'Turning off...' });
    expect(turningOff).toBeDisabled();
    await user.click(turningOff);
    expect(onUnsubscribe).not.toHaveBeenCalled();
  });

  it('keeps switches inert and explains why before alerts are on', async () => {
    const user = userEvent.setup();
    const { container, onTogglePref } = renderView({
      isSubscribed: false,
      presentation: 'embedded',
    });

    expect(
      screen.queryByRole('button', { name: 'Turn off alerts' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'New Music' }));
    expect(onTogglePref).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Alert preferences appear here after alerts are enabled.'
      )
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AlertsSettingsView
          isSubscribed
          contentPrefs={{ ...contentPrefs, merch: true }}
          onTogglePref={vi.fn()}
          onUnsubscribe={vi.fn()}
          isUnsubscribing={false}
        />
      </div>
    );

    expect(screen.getByRole('switch', { name: 'Merch' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
