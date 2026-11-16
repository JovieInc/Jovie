import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceRowActionsMenu } from './AudienceRowActionsMenu';

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => notifications,
}));

const row = {
  id: 'member-1',
  type: 'email',
  displayName: 'Ada',
  locationLabel: 'Unknown',
  geoCity: null,
  geoCountry: null,
  visits: 1,
  engagementScore: 0,
  intentLevel: 'low',
  latestActions: [],
  referrerHistory: [],
  utmParams: {},
  email: 'ada@example.com',
  emailVisibleToArtist: true,
  phone: '+1 555 0100',
  spotifyConnected: false,
  purchaseCount: 0,
  tipAmountTotalCents: 0,
  tipCount: 0,
  tags: [],
  deviceType: null,
  lastSeenAt: null,
} as AudienceMember;

const writeText = vi.fn<(text: string) => Promise<void>>();

// userEvent.setup() installs its own clipboard, so stub ours after it.
function setup() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return user;
}

beforeEach(() => {
  notifications.success.mockReset();
  notifications.error.mockReset();
  writeText.mockReset();
});

const originalExecCommand = document.execCommand;

afterEach(() => {
  document.execCommand = originalExecCommand;
});

describe('AudienceRowActionsMenu certificate', () => {
  it('opens from the trigger and reports the open change', async () => {
    const user = setup();
    const onOpenChange = vi.fn();
    render(
      <AudienceRowActionsMenu
        row={row}
        open={false}
        modal={false}
        onOpenChange={onOpenChange}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Open audience row actions' })
    );
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('copies the email and confirms it', async () => {
    const user = setup();
    writeText.mockResolvedValue(undefined);
    const { container } = render(
      <AudienceRowActionsMenu row={row} open modal={false} />
    );

    await user.click(screen.getByRole('menuitem', { name: 'Copy email' }));

    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith('Copied email')
    );
    expect(writeText).toHaveBeenCalledWith('ada@example.com');
    expect(screen.getByRole('menuitem', { name: 'Copied!' })).toBeVisible();
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(screen.getByRole('menu'));
  });

  it('copies the phone number', async () => {
    const user = setup();
    writeText.mockResolvedValue(undefined);
    render(<AudienceRowActionsMenu row={row} open modal={false} />);

    await user.click(screen.getByRole('menuitem', { name: 'Copy phone' }));

    await waitFor(() =>
      expect(notifications.success).toHaveBeenCalledWith('Copied phone number')
    );
    expect(writeText).toHaveBeenCalledWith('+1 555 0100');
  });

  it('reports a refused clipboard as an error', async () => {
    const user = setup();
    writeText.mockRejectedValue(new Error('blocked'));
    document.execCommand = vi.fn(() => false);
    const { container } = render(
      <AudienceRowActionsMenu row={row} open modal={false} />
    );

    await user.click(screen.getByRole('menuitem', { name: 'Copy email' }));
    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith('Failed to copy email')
    );
    await user.click(screen.getByRole('menuitem', { name: 'Copy phone' }));
    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'Failed to copy phone number'
      )
    );
    expect(notifications.success).not.toHaveBeenCalled();
    expect(screen.getByRole('menuitem', { name: 'Copy email' })).toBeVisible();
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(screen.getByRole('menu'));
  });

  it('disables both copy actions for a member with no contact details', async () => {
    const { container } = render(
      <AudienceRowActionsMenu
        row={{ ...row, email: null, phone: null }}
        open
        modal={false}
      />
    );

    expect(
      screen.getByRole('menuitem', { name: 'Copy email' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('menuitem', { name: 'Copy phone' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(writeText).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
    await expectNoA11yViolations(screen.getByRole('menu'));
  });
});
