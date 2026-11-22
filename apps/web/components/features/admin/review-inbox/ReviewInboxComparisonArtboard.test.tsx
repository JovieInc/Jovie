import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxComparisonArtboard } from './ReviewInboxComparisonArtboard';

describe('ReviewInboxComparisonArtboard', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, 'open', {
      configurable: true,
      get() {
        return true;
      },
    });
  });

  it('opens a fullscreen dialog with compare controls', () => {
    const pilotCase = createPilotReviewCase();
    render(
      <ReviewInboxComparisonArtboard
        candidates={pilotCase.candidates}
        activeRevision='v1'
        pins={[]}
        open
        onClose={vi.fn()}
        onAddPin={vi.fn()}
        draftNote=''
        onDraftNoteChange={vi.fn()}
      />
    );
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });
});
