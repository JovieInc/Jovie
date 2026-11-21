import { TooltipProvider } from '@jovie/ui';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WaitlistEntryRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistKanbanCard } from './WaitlistKanbanCard';

const entry: WaitlistEntryRow = {
  id: 'waitlist_1',
  fullName: 'Ari Lane',
  email: 'ari@example.com',
  primaryGoal: null,
  primarySocialUrl: 'https://instagram.com/ari',
  primarySocialPlatform: 'instagram',
  primarySocialUrlNormalized: 'https://instagram.com/ari',
  spotifyUrl: 'https://open.spotify.com/artist/ari',
  spotifyUrlNormalized: 'https://open.spotify.com/artist/ari',
  spotifyArtistName: 'Ari Lane',
  heardAbout: null,
  status: 'new',
  primarySocialFollowerCount: null,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  updatedAt: new Date('2026-01-10T00:00:00.000Z'),
};

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
        entry={{ ...entry, status: 'approved' }}
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
        entry={{ ...entry, status: 'signed_up' }}
        onApprove={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Signed up' })).toBeDisabled();
    await expectNoA11yViolations(signedUp.container);
  });

  it('omits links and the action when there is nothing to show', async () => {
    const { container } = render(
      <WaitlistKanbanCard
        entry={{
          ...entry,
          primarySocialUrlNormalized: '',
          spotifyUrlNormalized: null,
        }}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
