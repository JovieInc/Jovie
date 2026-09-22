import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { mutate } = vi.hoisted(() => ({
  mutate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/queries', () => ({
  useMarkLeadDmSentMutation: () => ({ mutateAsync: mutate, isPending: false }),
}));
vi.mock('@/components/feedback', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { DmQueueCard } from './DmQueueCard';

const lead = {
  id: 'lead-1',
  displayName: 'River Lane',
  instagramHandle: 'riverlane',
  priorityScore: 80,
  dmCopy: 'Claim your page',
  outreachStatus: 'pending',
};
describe('DM completeness eligibility', () => {
  it('hides old copy and disables both outreach actions without a certificate', () => {
    render(<DmQueueCard lead={lead} onMarkedSent={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Copy DM' })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Mark as DM'd" })).toBeDisabled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.getByText('Profile review is required before outreach.')
    ).toBeInTheDocument();
  });
  it('permits the existing action only for eligible profiles', async () => {
    const onMarkedSent = vi.fn();
    render(
      <DmQueueCard
        lead={{ ...lead, completenessEligible: true }}
        onMarkedSent={onMarkedSent}
      />
    );
    expect(screen.getByRole('textbox')).toHaveValue('Claim your page');
    await userEvent.click(screen.getByRole('button', { name: "Mark as DM'd" }));
    expect(mutate).toHaveBeenCalledWith('lead-1');
    expect(onMarkedSent).toHaveBeenCalledOnce();
  });
});
