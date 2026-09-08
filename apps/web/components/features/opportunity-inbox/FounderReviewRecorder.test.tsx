import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FounderReviewRecorder,
  type FounderReviewRecorderHandle,
} from './FounderReviewRecorder';

const hoisted = vi.hoisted(() => ({
  createReview: vi.fn(),
  listReceipts: vi.fn(),
  deleteAudio: vi.fn(),
  createTranscriber: vi.fn(),
  updateOutcome: vi.fn(),
}));

vi.mock('@/lib/founder-review/client', () => ({
  createFounderReviewClient: hoisted.createReview,
  listFounderReviewReceipts: hoisted.listReceipts,
  deleteFounderReviewAudio: hoisted.deleteAudio,
  uploadFounderReviewAudio: vi.fn(),
  updateFounderReviewActionOutcome: hoisted.updateOutcome,
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
  decision: 'approved' as const,
  recording: { mediaAvailable: false },
  actionOutcome: {
    status: 'pending' as const,
    updatedAt: '2026-09-01T18:00:08.000Z',
    errorCode: null,
  },
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
    hoisted.updateOutcome.mockImplementation(async input => ({
      ...RECEIPT,
      actionOutcome: {
        status: input.status,
        updatedAt: '2026-09-01T18:00:08.000Z',
        errorCode: input.errorCode,
      },
    }));
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

  it('stores a failed canonical action outcome for a retryable receipt', async () => {
    const user = userEvent.setup();
    const onApprove = vi
      .fn()
      .mockRejectedValue(new Error('action unavailable'));
    render(<FounderReviewRecorder target={TARGET} onApprove={onApprove} />);

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not saved. action unavailable'
    );
    expect(hoisted.updateOutcome).toHaveBeenCalledWith({
      receiptId: 'receipt-1',
      status: 'failed',
      errorCode: 'canonical-action-failed',
    });
  });

  it('serializes rapid opposite decisions before React state can render', async () => {
    const ref = createRef<FounderReviewRecorderHandle>();
    let resolveReview: ((value: typeof RECEIPT) => void) | undefined;
    hoisted.createReview.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveReview = resolve;
        })
    );
    render(
      <FounderReviewRecorder
        ref={ref}
        target={TARGET}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />
    );

    act(() => {
      ref.current?.approve();
      ref.current?.reject();
    });

    await waitFor(() => expect(hoisted.createReview).toHaveBeenCalledTimes(1));
    expect(hoisted.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approved' })
    );
    resolveReview?.(RECEIPT);
    await waitFor(() => expect(screen.getByText(/Saved/)).toBeVisible());
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
    const transcribers: ReturnType<typeof transcriber>[] = [];
    const transcriberCallbacks: Array<{
      onTranscript: (text: string) => void;
      onEnd?: () => void;
    }> = [];
    hoisted.createTranscriber.mockImplementation(callbacks => {
      const next = transcriber(true);
      next.stop.mockImplementation(() => callbacks.onEnd?.());
      transcribers.push(next);
      transcriberCallbacks.push(callbacks);
      return next;
    });
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
    act(() => {
      transcriberCallbacks[0]?.onTranscript('First thought.');
      transcriberCallbacks[0]?.onEnd?.();
      transcriberCallbacks[0]?.onTranscript('Second thought.');
    });

    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(hoisted.createTranscriber).toHaveBeenCalledTimes(2)
    );
    expect(hoisted.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        target: TARGET,
        decision: 'approved',
        transcript: 'First thought. Second thought.',
      })
    );
    expect(transcribers[0]?.start).toHaveBeenCalledTimes(2);
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

  it('serializes rapid microphone acquisition attempts', async () => {
    let resolveStream:
      | ((value: { getTracks: () => Array<{ stop: () => void }> }) => void)
      | undefined;
    const getUserMedia = vi.fn(
      () =>
        new Promise<{ getTracks: () => Array<{ stop: () => void }> }>(
          resolve => {
            resolveStream = resolve;
          }
        )
    );
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      mediaDevices: { getUserMedia },
    });
    render(<FounderReviewRecorder target={TARGET} />);

    const start = screen.getByRole('button', { name: 'Start Session' });
    fireEvent.click(start);
    fireEvent.click(start);

    expect(getUserMedia).toHaveBeenCalledOnce();
    resolveStream?.({ getTracks: () => [] });
    await waitFor(() =>
      expect(screen.getByText(/Recording this card/)).toBeVisible()
    );
  });

  it('reconciles an applied prior action without applying the next card', async () => {
    const user = userEvent.setup();
    const firstAction = vi.fn();
    const secondAction = vi.fn();
    const nextTarget = { ...TARGET, id: 'card-2', title: 'Second card' };
    hoisted.updateOutcome
      .mockRejectedValueOnce(new Error('receipt update unavailable'))
      .mockResolvedValueOnce({
        ...RECEIPT,
        actionOutcome: {
          status: 'applied',
          updatedAt: '2026-09-01T18:00:09.000Z',
          errorCode: null,
        },
      });

    function Harness() {
      const [target, setTarget] = useState(TARGET);
      return (
        <FounderReviewRecorder
          target={target}
          onApprove={() => {
            if (target.id === TARGET.id) {
              firstAction();
              setTarget(nextTarget);
            } else {
              secondAction();
            }
          }}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /action applied, but its receipt outcome still needs reconciliation/i
    );
    expect(firstAction).toHaveBeenCalledOnce();
    expect(
      screen.getByLabelText('Typed fallback or refinement')
    ).toHaveAttribute('id', 'founder-note-card-2');

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(hoisted.updateOutcome).toHaveBeenCalledTimes(2));
    expect(secondAction).not.toHaveBeenCalled();
    expect(hoisted.createReview).toHaveBeenCalledOnce();
  });

  it('persists the exact transcription permission failure', async () => {
    const user = userEvent.setup();
    let callbacks:
      | {
          onError?: (code: 'not-allowed') => void;
        }
      | undefined;
    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      },
    });
    hoisted.createTranscriber.mockImplementation(nextCallbacks => {
      callbacks = nextCallbacks;
      return transcriber(true);
    });
    render(<FounderReviewRecorder target={TARGET} onApprove={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Start Session' }));
    act(() => callbacks?.onError?.('not-allowed'));
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(hoisted.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        transcription: {
          provider: 'none',
          status: 'permission-denied',
          errorCode: 'not-allowed',
        },
      })
    );
  });
});
