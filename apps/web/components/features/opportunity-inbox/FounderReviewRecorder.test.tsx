import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FounderReviewRecorder } from './FounderReviewRecorder';

const hoisted = vi.hoisted(() => ({
  createReview: vi.fn(),
  listReceipts: vi.fn(),
  deleteAudio: vi.fn(),
  createTranscriber: vi.fn(),
}));

vi.mock('@/lib/founder-review/client', () => ({
  createFounderReviewClient: hoisted.createReview,
  listFounderReviewReceipts: hoisted.listReceipts,
  deleteFounderReviewAudio: hoisted.deleteAudio,
  uploadFounderReviewAudio: vi.fn(),
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

const RECEIPT = {
  id: 'receipt-1',
  target: TARGET,
  recording: { mediaAvailable: false },
};

function transcriber(isSupported = false) {
  return {
    isSupported,
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('FounderReviewRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.listReceipts.mockResolvedValue([]);
    hoisted.createReview.mockResolvedValue(RECEIPT);
    hoisted.createTranscriber.mockReturnValue(transcriber());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to transcript-only storage and no future content use', () => {
    render(<FounderReviewRecorder target={TARGET} />);

    expect(
      screen.getByRole('checkbox', { name: 'Keep private audio after saving' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', {
        name: 'Allow this material in future content',
      })
    ).not.toBeChecked();
    expect(
      screen.getByText(
        /never authorizes publishing or another external action/i
      )
    ).toBeVisible();
  });

  it('persists typed rationale before invoking an explicit approval', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    let resolveReview: ((value: typeof RECEIPT) => void) | undefined;
    hoisted.createReview.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveReview = resolve;
        })
    );
    render(<FounderReviewRecorder target={TARGET} onApprove={onApprove} />);

    await user.type(
      screen.getByLabelText('Typed fallback or refinement'),
      'Make the subject readable at mobile size.'
    );
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(hoisted.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'approved',
        typedText: 'Make the subject readable at mobile size.',
        recording: expect.objectContaining({
          status: 'not-captured',
          retention: 'transcript-only',
        }),
        consent: expect.objectContaining({ contentUse: 'not-allowed' }),
      })
    );
    expect(onApprove).not.toHaveBeenCalled();

    resolveReview?.(RECEIPT);
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce());
  });

  it('fails closed when receipt persistence fails', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    hoisted.createReview.mockRejectedValue(new Error('database unavailable'));
    render(<FounderReviewRecorder target={TARGET} onReject={onReject} />);

    await user.click(screen.getByRole('button', { name: 'Reject' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not saved. database unavailable'
    );
    expect(onReject).not.toHaveBeenCalled();
  });

  it('keeps the session alive while binding a fresh segment to the next card', async () => {
    const user = userEvent.setup();
    const stopTrack = vi.fn();
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        }),
      },
    });
    hoisted.createTranscriber.mockImplementation(() => transcriber(true));
    const nextTarget = { ...TARGET, id: 'card-2', title: 'Second card' };

    function Harness() {
      const [target, setTarget] = useState(TARGET);
      return (
        <FounderReviewRecorder
          target={target}
          onApprove={() => setTarget(nextTarget)}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Start Session' }));
    expect(screen.getByText(/Recording this card/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(hoisted.createTranscriber).toHaveBeenCalledTimes(2)
    );
    expect(hoisted.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ target: TARGET, decision: 'approved' })
    );
    expect(stopTrack).not.toHaveBeenCalled();
  });

  it('keeps typed fallback available when microphone permission is denied', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });
    render(<FounderReviewRecorder target={TARGET} />);

    await user.click(screen.getByRole('button', { name: 'Start Session' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Microphone access is off'
    );
    expect(screen.getByLabelText('Typed fallback or refinement')).toBeEnabled();
  });
});
