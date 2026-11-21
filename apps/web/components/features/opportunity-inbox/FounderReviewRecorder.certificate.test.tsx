import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FounderReviewRecorder } from './FounderReviewRecorder';

const hoisted = vi.hoisted(() => ({
  createReview: vi.fn(),
  listReceipts: vi.fn(),
  createTranscriber: vi.fn(),
}));

vi.mock('@/lib/founder-review/client', () => ({
  createFounderReviewClient: hoisted.createReview,
  listFounderReviewReceipts: hoisted.listReceipts,
  deleteFounderReviewAudio: vi.fn(),
  uploadFounderReviewAudio: vi.fn(),
  updateFounderReviewActionOutcome: vi.fn(),
}));

vi.mock('@/lib/chat/transcriber', () => ({
  createWebSpeechTranscriber: hoisted.createTranscriber,
}));

const TARGET = {
  type: 'inbox-card' as const,
  id: 'card-1',
  title: 'Refresh a weak YouTube thumbnail',
  sourceKind: 'youtube.thumbnail_candidate',
  category: 'suggestion',
};

describe('FounderReviewRecorder certificate', () => {
  beforeEach(() => {
    hoisted.listReceipts.mockResolvedValue([]);
    hoisted.createTranscriber.mockReturnValue({
      isSupported: false,
      start: vi.fn(),
      stop: vi.fn(),
      dispose: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('is axe-clean while the receipt history is still loading', async () => {
    hoisted.listReceipts.mockReturnValue(new Promise(() => {}));
    const { container } = render(<FounderReviewRecorder target={TARGET} />);

    expect(screen.getByRole('button', { name: 'Start Session' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('keeps typed notes and shows a message when the microphone is refused', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    const { container } = render(<FounderReviewRecorder target={TARGET} />);

    await user.type(screen.getByLabelText('Notes'), 'Keep this note');
    await user.click(screen.getByRole('button', { name: 'Start Session' }));

    expect(await screen.findByText(/Microphone access is off/)).toBeVisible();
    expect(screen.getByLabelText('Notes')).toHaveValue('Keep this note');
    await expectNoA11yViolations(container);
  });

  it('reports an unsaved decision when the receipt service is offline', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    hoisted.createReview.mockRejectedValue(new Error('Network is offline'));
    const { container } = render(
      <FounderReviewRecorder target={TARGET} onApprove={onApprove} />
    );

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(screen.getByText(/Not saved\. Network is offline/)).toBeVisible()
    );
    expect(onApprove).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows a long title and an Arabic title without losing the controls', async () => {
    const longTitle =
      'Refresh the weak YouTube thumbnail for the remix stems lyric video and the pre-save page that still points at the old cover art';
    const { container, rerender } = render(
      <FounderReviewRecorder target={{ ...TARGET, title: longTitle }} />
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <FounderReviewRecorder
          target={{ ...TARGET, title: 'تحديث الصورة المصغرة الضعيفة' }}
        />
      </div>
    );
    expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
