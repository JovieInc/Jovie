import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { OpportunityInboxCard } from './OpportunityInboxCard';

it('keeps entity identity visible while pending decisions remain disabled', async () => {
  const user = userEvent.setup();
  const onApprove = vi.fn();
  const onDismiss = vi.fn();
  render(
    <OpportunityInboxCard
      card={{
        id: 'opportunity-1',
        signalType: 'new_song',
        typeLabel: 'New Song',
        createdAt: '2026-10-24T00:00:00Z',
        title: 'Review Release',
        why: 'Catalog Match',
        primaryActionLabel: 'Review',
        status: 'pending',
        category: 'suggestion',
        entity: { kind: 'track', id: 'track-1', label: 'Track Name' },
      }}
      isApproving
      onApprove={onApprove}
      onDismiss={onDismiss}
      onFeedback={vi.fn()}
    />
  );
  expect(screen.getByTestId('entity-header-title')).toHaveTextContent(
    'Track Name'
  );
  const dismiss = screen.getByRole('button', { name: 'Dismiss' });
  expect(dismiss).toBeDisabled();
  await user.click(dismiss);
  expect(onDismiss).not.toHaveBeenCalled();
  expect(onApprove).not.toHaveBeenCalled();
});
