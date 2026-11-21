import { TooltipProvider } from '@jovie/ui';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

const entry = {
  id: 'waitlist_1',
  fullName: 'Ari Lane',
  email: 'ari@example.com',
  primaryGoal: null,
  primarySocialPlatform: 'instagram',
  primarySocialUrlNormalized: 'https://instagram.com/ari',
  spotifyUrlNormalized: 'https://open.spotify.com/artist/ari',
  status: 'new',
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
} as WaitlistEntryRow;

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: TooltipProvider });
}

describe('WaitlistKanbanCard certificate', () => {
  it('approves from the action button and stays axe-clean', async () => {
    const onApprove = vi.fn();
    const { container } = render(
      <WaitlistKanbanCard entry={entry} onApprove={onApprove} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('offers Disapprove for an approved entry', async () => {
    const { container } = render(
      <WaitlistKanbanCard
        entry={{ ...entry, status: 'approved' } as WaitlistEntryRow}
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Disapprove' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('locks the action while pending or once signed up', async () => {
    const pending = render(
      <WaitlistKanbanCard
        entry={entry}
        approveStatus='approving'
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled();
    await expectNoA11yViolations(pending.container);
    pending.unmount();

    const signedUp = render(
      <WaitlistKanbanCard
        entry={{ ...entry, status: 'signed_up' } as WaitlistEntryRow}
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Signed up' })).toBeDisabled();
    await expectNoA11yViolations(signedUp.container);
  });

  it('omits links and the action when there is nothing to show', async () => {
    const { container } = render(
      <WaitlistKanbanCard
        entry={
          {
            ...entry,
            primarySocialUrlNormalized: null,
            spotifyUrlNormalized: null,
          } as WaitlistEntryRow
        }
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
