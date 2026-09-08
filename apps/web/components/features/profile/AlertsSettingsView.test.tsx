import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationContentType } from '@/types/notifications';
import { AlertsSettingsView } from './AlertsSettingsView';

const contentPrefs: Record<NotificationContentType, boolean> = {
  newMusic: true,
  tourDates: false,
  merch: false,
  general: false,
};

const viewProps = {
  presentation: 'embedded' as const,
  contentPrefs,
  onUnsubscribe: vi.fn(),
  isUnsubscribing: false,
};

describe('AlertsSettingsView', () => {
  it('keeps preference switches inside Manage after signup', () => {
    const onTogglePref = vi.fn<(key: NotificationContentType) => void>();
    render(
      <AlertsSettingsView
        {...viewProps}
        isSubscribed
        onTogglePref={onTogglePref}
      />
    );

    const merchSwitch = screen.getByRole('switch', { name: 'Merch' });
    expect(merchSwitch).toHaveAttribute('aria-checked', 'false');
    merchSwitch.click();
    expect(onTogglePref).toHaveBeenCalledWith('merch');
    expect(screen.getByRole('switch', { name: 'New Music' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('does not expose preference switches as live controls before signup', () => {
    const onTogglePref = vi.fn();
    render(
      <AlertsSettingsView
        {...viewProps}
        isSubscribed={false}
        onTogglePref={onTogglePref}
      />
    );

    expect(screen.getByRole('switch', { name: 'Merch' })).toBeDisabled();
    screen.getByRole('switch', { name: 'Merch' }).click();
    expect(onTogglePref).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Alert preferences appear here after alerts are enabled.'
      )
    ).toBeVisible();
  });
});
