import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { FounderReviewReceipt } from '@/lib/founder-review/contract';
import { FounderReviewRecorderControls } from './FounderReviewRecorderControls';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Founder Review Recorder Controls',
  component: FounderReviewRecorderControls,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FounderReviewRecorderControls>;

export default meta;
type Story = StoryObj<typeof meta>;

const target = {
  type: 'inbox-card' as const,
  id: 'card-1',
  title: 'Refresh a weak YouTube thumbnail',
  sourceKind: 'youtube.thumbnail_candidate',
  category: 'suggestion',
};

const receipt = {
  schemaVersion: 1,
  id: 'receipt-1',
  sessionId: 'session-1',
  segmentId: 'segment-1',
  target,
  decision: 'approved' as const,
  transcript: 'Approve this one — the new thumbnail reads better at feed size.',
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

export const Idle: Story = {
  args: {
    target,
    sessionActive: false,
    transcript: '',
    typedText: '',
    keepAudio: false,
    allowContentUse: false,
    saving: false,
    error: null,
    latestReceipt: null,
    onStart: () => {},
    onStop: () => {},
    onTypedTextChange: () => {},
    onKeepAudioChange: () => {},
    onAllowContentUseChange: () => {},
    onDeleteAudio: () => {},
    onSaveNote: () => {},
    onApprove: () => {},
    onReject: () => {},
  },
};

export const Recording: Story = {
  args: {
    ...Idle.args,
    sessionActive: true,
    transcript: 'Approve this one — the new thumbnail reads better at feed size.',
    typedText: 'Also pull the old cover art.',
    keepAudio: true,
  },
};

export const Saving: Story = {
  args: {
    ...Idle.args,
    sessionActive: true,
    saving: true,
  },
};

export const SavedTranscriptOnly: Story = {
  args: {
    ...Idle.args,
    latestReceipt: receipt,
  },
};

export const ErrorState: Story = {
  args: {
    ...Idle.args,
    error: 'Microphone permission was denied. Typed notes still work.',
  },
};
