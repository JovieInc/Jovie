import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminCreatorProfileRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CreatorActionsMenu } from './CreatorActionsMenu';

const profile = {
  id: 'profile-1',
  username: 'alice',
  displayName: 'Alice',
  isVerified: false,
  isFeatured: true,
  marketingOptOut: false,
  isClaimed: false,
  claimToken: 'token',
} as unknown as AdminCreatorProfileRow;

function setup(
  overrides: Partial<Parameters<typeof CreatorActionsMenu>[0]> = {}
) {
  const props = {
    profile,
    isMobile: false,
    status: 'idle' as const,
    onToggleVerification: vi.fn(async () => {}),
    onToggleFeatured: vi.fn(async () => {}),
    onToggleMarketing: vi.fn(async () => {}),
    onSendInvite: vi.fn(),
    onRefreshIngest: vi.fn(async () => {}),
    onDelete: vi.fn(),
    ...overrides,
  };
  const view = render(<CreatorActionsMenu {...props} />);
  return { props, ...view };
}

describe('CreatorActionsMenu certificate', () => {
  it('has an accessible closed trigger on desktop and mobile', async () => {
    const { container, unmount } = setup();
    expect(
      screen.getByRole('button', { name: 'Open Creator Actions' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
    unmount();

    const mobile = setup({ isMobile: true });
    expect(screen.getByRole('button', { name: /Actions/ })).toBeEnabled();
    await expectNoA11yViolations(mobile.container);
  });

  it('runs each menu action and hides delete for a featured creator', async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(
      screen.getByRole('button', { name: 'Open Creator Actions' })
    );
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).toBeNull();
    const featured = await screen.findByRole('menuitem', { name: 'Unfeature' });
    expect(featured.querySelector('svg')).toHaveClass('fill-warning');

    await user.click(featured);
    expect(props.onToggleFeatured).toHaveBeenCalledOnce();
  });

  it('fires invite, verification and marketing actions', async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup();
    for (const [name, handler] of [
      ['Send Invite', props.onSendInvite],
      ['Verify Creator', props.onToggleVerification],
      ['Disable Marketing Emails', props.onToggleMarketing],
      ['Refresh Ingest', props.onRefreshIngest],
    ] as const) {
      await user.click(
        screen.getByRole('button', { name: 'Open Creator Actions' })
      );
      await user.click(await screen.findByRole('menuitem', { name }));
      expect(handler).toHaveBeenCalledOnce();
      rerender(<CreatorActionsMenu {...props} />);
    }
  });

  it('disables the trigger while an ingest refresh is loading', () => {
    setup({ refreshIngestStatus: 'loading' });
    expect(
      screen.getByRole('button', { name: 'Open Creator Actions' })
    ).toBeDisabled();
  });
});
