import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxListView } from './ReviewInboxListView';

describe('ReviewInboxListView', () => {
  it('selects a revision from the keyboard table', async () => {
    const onSelect = vi.fn();
    render(
      <ReviewInboxListView
        pilotCase={createPilotReviewCase()}
        selectedRevision='v1'
        onSelect={onSelect}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Candidate B/i }));
    expect(onSelect).toHaveBeenCalledWith('v2');
  });
});
