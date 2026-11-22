import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxEditorialView } from './ReviewInboxEditorialView';

describe('ReviewInboxEditorialView', () => {
  it('shows approval disclosure and enables accept only after changes', () => {
    const props = {
      busy: false,
      onRequestChanges: vi.fn(),
      onAcceptV2: vi.fn(),
    };
    const { rerender } = render(
      <ReviewInboxEditorialView
        pilotCase={createPilotReviewCase()}
        {...props}
      />
    );
    expect(screen.getByTestId('review-inbox-approval-disclosure')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept v2' })).toBeDisabled();
    rerender(
      <ReviewInboxEditorialView
        pilotCase={{
          ...createPilotReviewCase(),
          lifecycle: 'changes_requested',
          activeRevision: 'v2',
        }}
        {...props}
      />
    );
    expect(screen.getByRole('button', { name: 'Accept v2' })).toBeEnabled();
  });
});
