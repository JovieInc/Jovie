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
      receipt={RECEIPT}
      typedText=""
      keepAudio={false}
      allowContentUse={false}
      audioState={null}
      saving={false}
      {...overrides}
      {...handlers}
    />
  );
  return handlers;
}

describe('FounderReviewRecorderControls', () => {
  it('keeps approve/reject hidden while no session is active', () => {
    renderControls();

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('requires typed fallback text before approve is enabled', async () => {
    const user = userEvent.setup();
    const { onApprove } = renderControls({ sessionActive: true });

    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();

    await user.type(
      screen.getByLabelText('Typed fallback or refinement'),
      'Looks right'
    );

    expect(approve).toBeEnabled();
    await user.click(approve);
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('requires typed fallback text before reject is enabled', async () => {
    const user = userEvent.setup();
    const { onReject } = renderControls({ sessionActive: true });

    const reject = screen.getByRole('button', { name: 'Reject' });
    expect(reject).toBeDisabled();

    await user.type(
      screen.getByLabelText('Typed fallback or refinement'),
      'Wrong target'
    );

    expect(reject).toBeEnabled();
    await user.click(reject);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('routes typed input through onTypedTextChange', async () => {
    const user = userEvent.setup();
    const { onTypedTextChange, onKeepAudioChange, onAllowContentUseChange } =
      renderControls();

    await user.type(screen.getByLabelText('Typed fallback or refinement'), 'x');
    expect(onTypedTextChange).toHaveBeenCalledWith('x');

    await user.click(
      screen.getByRole('checkbox', { name: 'Keep the recording' })
    );
    expect(onKeepAudioChange).toHaveBeenCalledWith(true);

    await user.click(
      screen.getByRole('checkbox', { name: 'Allow content use' })
    );
    expect(onAllowContentUseChange).toHaveBeenCalledWith(true);
  });

  it('keeps the delete-audio action available when media exists', async () => {
    const user = userEvent.setup();
    const { onDeleteAudio } = renderControls({
      sessionActive: true,
      audioState: {
        status: 'ready' as const,
        url: 'blob:founder-review-audio',
        byteSize: 2048,
      },
    });

    const del = screen.getByRole('button', { name: /delete audio/i });
    expect(del).toBeEnabled();
    await user.click(del);
    expect(onDeleteAudio).toHaveBeenCalledTimes(1);
  });

  it('disables decision actions while a save is in flight', () => {
    renderControls({ sessionActive: true, saving: true });

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
});
