import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxComparisonArtboard } from './ReviewInboxComparisonArtboard';

describe('ReviewInboxComparisonArtboard', () => {
  beforeEach(() => {
    let open = false;
    HTMLDialogElement.prototype.showModal = vi.fn(() => {
      open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(() => {
      open = false;
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'open', {
      configurable: true,
      get() {
        return open;
      },
    });
  });

  it('opens a fullscreen dialog when the artboard is shown', () => {
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
