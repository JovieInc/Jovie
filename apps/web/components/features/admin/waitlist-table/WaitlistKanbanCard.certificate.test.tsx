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
  primaryGoal: 'streams',
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
} as WaitlistEntryRow;

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra';
const LONG_EMAIL =
  'aurelia.montgomery.fitzgerald.management@extraordinarily-long-label-name.example.com';

function render(ui: ReactElement) {
  return rtlRender(ui, { wrapper: TooltipProvider });
}

describe('WaitlistKanbanCard certificate states', () => {
  it('shows the goal, platform and links, and approves on click', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const { container } = render(
      <WaitlistKanbanCard entry={entry} onApprove={onApprove} />
    );
    expect(screen.getByText('Streams')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps the button usable after a failed approval so it can be retried', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const { container } = render(
      <WaitlistKanbanCard
        entry={entry}
        approveStatus='error'
        onApprove={onApprove}
      />
    );
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeEnabled();
    await user.click(approve);
    expect(onApprove).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('locks the button while a decision is in flight', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const { rerender } = render(
      <WaitlistKanbanCard
        entry={entry}
        approveStatus='approving'
        onApprove={onApprove}
      />
    );
    expect(screen.getByRole('button', { name: 'Approving…' })).toBeDisabled();
    rerender(
      <WaitlistKanbanCard
        entry={{ ...entry, status: 'invited' } as WaitlistEntryRow}
        approveStatus='disapproving'
        onApprove={onApprove}
      />
    );
    const button = screen.getByRole('button', { name: 'Disapproving…' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('offers to disapprove an invited entry and locks a signed-up one', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const { container, rerender } = render(
      <WaitlistKanbanCard
        entry={{ ...entry, status: 'approved' } as WaitlistEntryRow}
        onApprove={onApprove}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Disapprove' }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);

    rerender(
      <WaitlistKanbanCard
        entry={{ ...entry, status: 'claimed' } as WaitlistEntryRow}
        onApprove={onApprove}
      />
    );
    expect(screen.getByRole('button', { name: 'Signed up' })).toBeDisabled();
  });

  it('leaves out the goal, links and action a partial entry lacks', async () => {
    const { container } = render(
      <WaitlistKanbanCard
        entry={
          {
            ...entry,
            primaryGoal: null,
            primarySocialPlatform: 'mastodon',
            primarySocialUrlNormalized: '',
            spotifyUrlNormalized: null,
          } as WaitlistEntryRow
        }
      />
    );
    expect(screen.queryByText('Goal:')).toBeNull();
    expect(screen.queryByText('Spotify:')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('mastodon')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('truncates long copy and stays axe clean right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <WaitlistKanbanCard
          entry={
            {
              ...entry,
              fullName: LONG_NAME,
              email: LONG_EMAIL,
              primaryGoal: 'fan_club',
              primarySocialUrlNormalized:
                'https://instagram.com/aurelia.montgomery.fitzgerald.official',
            } as WaitlistEntryRow
          }
          onApprove={vi.fn()}
        />
      </div>
    );
    expect(screen.getByRole('heading', { name: LONG_NAME })).toHaveClass(
      'truncate'
    );
    expect(screen.getByText(LONG_EMAIL)).toHaveClass('truncate');
    expect(
      screen.getByRole('link', {
        name: 'instagram.com/aurelia.montgomery.fitzgerald.official',
      })
    ).toHaveClass('truncate');
    expect(screen.getByText('fan_club')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
