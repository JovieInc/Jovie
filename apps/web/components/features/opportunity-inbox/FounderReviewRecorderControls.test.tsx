import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FounderReviewReceipt } from '@/lib/founder-review/contract';
import { FounderReviewRecorderControls } from './FounderReviewRecorderControls';

const TARGET = {
  type: 'inbox-card' as const,
  id: 'card-1',
  title: 'Refresh a weak YouTube thumbnail',
  sourceKind: 'youtube.thumbnail_candidate',
  category: 'suggestion',
} as const;

const RECEIPT = {
  schemaVersion: 1,
  id: 'receipt-1',
  sessionId: 'session-1',
  segmentId: 'segment-1',
  target: TARGET,
  decision: 'approved' as const,
  transcript: 'Typed rationale',
  typedText: '',
  transcription: { provider: 'none', status: 'unsupported', errorCode: null },
  recording: {
    startedAt: '2026-09-01T18:00:00.000Z',
    endedAt: '2026-09-01T18:00:08.000Z',
    initiatedBy: 'button' as const,
    status: 'not-captured' as const,
    retention: 'transcript-only' as const,
    durationMs: 8000,
    byteSize: null,
    sha256: null,
    mediaAvailable: false,
    mediaPath: null,
    deletedAt: null,
  },
  consent: {
    disclosureVersion: 1,
    contentUse: 'not-allowed' as const,
    capturedAt: '2026-09-01T18:00:00.000Z',
  },
  rationaleExtractionStatus: 'not-requested' as const,
  actionOutcome: {
    status: 'pending' as const,
    updatedAt: '2026-09-01T18:00:08.000Z',
    errorCode: null,
  },
  provenance: {
    surface: 'opportunity-inbox' as const,
    sourceBinding: 'inbox-card:card-1:youtube.thumbnail_candidate',
    founderMaterial: true,
  },
  authority: {
    externalActionAuthorized: false as const,
    exactContent: null,
    destination: null,
    requiresExplicitApproval: true as const,
  },
  createdAt: '2026-09-01T18:00:08.000Z',
} satisfies FounderReviewReceipt;

function renderControls(
  overrides: Partial<Parameters<typeof FounderReviewRecorderControls>[0]> = {}
) {
  const handlers = {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onTypedTextChange: vi.fn(),
    onKeepAudioChange: vi.fn(),
    onAllowContentUseChange: vi.fn(),
    onDeleteAudio: vi.fn(),
    onSaveNote: vi.fn(),
    onApprove: vi.fn(),
    onReject: vi.fn(),
  };
  render(
    <FounderReviewRecorderControls
      target={TARGET}
      sessionActive={false}
      transcript=''
      typedText=''
      keepAudio={false}
      allowContentUse={false}
      saving={false}
      error={null}
      latestReceipt={null}
      {...overrides}
      {...handlers}
    />
  );
  return handlers;
}

describe('FounderReviewRecorderControls', () => {
  it('starts a session from idle and reports the off-state', async () => {
    const user = userEvent.setup();
    const { onStart } = renderControls();

    expect(screen.getByText(/Mic off/)).toBeVisible();
    const startButton = screen.getByRole('button', { name: 'Start Session' });
    await user.click(startButton);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('stops an active session and surfaces the live transcript', async () => {
    const user = userEvent.setup();
    const { onStop } = renderControls({
      sessionActive: true,
      transcript: 'Approve this one before the weekend drop.',
    });

    expect(screen.getByText(/^Recording ·/)).toBeVisible();
    expect(
      screen.getByText(/Approve this one before the weekend drop/)
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Stop And Save' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('routes typed text and consent toggles through the parent handlers', async () => {
    const user = userEvent.setup();
    const { onTypedTextChange, onKeepAudioChange, onAllowContentUseChange } =
      renderControls();

    await user.type(screen.getByLabelText('Notes'), 'x');
    expect(onTypedTextChange).toHaveBeenCalledWith('x');

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Keep private audio after saving',
      })
    );
    expect(onKeepAudioChange).toHaveBeenCalledWith(true);

    await user.click(
      screen.getByRole('checkbox', {
        name: 'Allow this material in future content',
      })
    );
    expect(onAllowContentUseChange).toHaveBeenCalledWith(true);
  });

  it('keeps both consent choices off and supports keyboard opt-in', async () => {
    const user = userEvent.setup();
    const { onKeepAudioChange, onAllowContentUseChange } = renderControls();
    const choices = screen.getAllByRole('checkbox');
    for (const choice of choices) expect(choice).not.toBeChecked();

    choices[0].focus();
    await user.keyboard(' ');
    expect(onKeepAudioChange).toHaveBeenCalledExactlyOnceWith(true);
    await user.tab();
    expect(choices[1]).toHaveFocus();
    await user.keyboard(' ');
    expect(onAllowContentUseChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(screen.getByText(/never authorizes publishing/)).toBeVisible();
  });

  it('disables recording, notes, consent and decisions while saving', async () => {
    const user = userEvent.setup();
    const handlers = renderControls({ saving: true });
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeDisabled();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeDisabled();
      await user.click(checkbox);
    }
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      await user.click(button);
    }
    for (const handler of Object.values(handlers)) {
      expect(handler).not.toHaveBeenCalled();
    }
  });

  it('offers audio deletion only for a retained recording', async () => {
    const user = userEvent.setup();
    const { onDeleteAudio } = renderControls({
      latestReceipt: {
        ...RECEIPT,
        recording: { ...RECEIPT.recording, mediaAvailable: true },
      },
    });
    await user.click(screen.getByRole('button', { name: /Delete Audio/ }));
    expect(onDeleteAudio).toHaveBeenCalledOnce();
    expect(screen.getByText(/private audio retained/)).toBeVisible();
  });

  it('fires approve and reject when active', async () => {
    const user = userEvent.setup();
    const { onApprove, onReject } = renderControls({ sessionActive: true });

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onApprove).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('surfaces errors via alert role', () => {
    renderControls({
      error: 'Microphone permission was denied. Typed notes still work.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Microphone permission was denied'
    );
  });

  it('shows the saved-receipt status without delete affordance for transcript-only reviews', () => {
    renderControls({ latestReceipt: RECEIPT });

    expect(
      screen.getByText(/Saved · Refresh a weak YouTube thumbnail/)
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /Delete Audio/ })).toBeNull();
  });

  it('swaps the decision row for Save Brain Dump on founder-note targets', () => {
    renderControls({
      target: {
        type: 'founder-note',
        id: 'note-1',
        title: 'Brain Dump',
        sourceKind: 'founder.brain_dump',
        category: 'suggestion',
      },
    });

    expect(
      screen.getByRole('button', { name: 'Save Brain Dump' })
    ).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });
});
