/** Pure manual guidance. Never submits a request or deletes a video. */
import type {
  ForeignContentCase,
  ForeignContentClassification,
} from './foreign-content';

const RELEASE_HELP = 'https://support.google.com/youtube/answer/14075432';
const FOREIGN_OPTION = 'This is not my release. Remove from channel.';
const OWNED_OPTION = 'Although this is my release, remove from channel.';

export interface RemovalPlaybookEntry {
  readonly classification: ForeignContentClassification;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly referenceUrl: string;
  readonly apiCapableToday: false;
}

const REVIEW_STEPS = [
  'Review the exact release and its tracks against the artist catalog with the channel owner. Resolve conflicting evidence first.',
  'Open YouTube Studio on desktop as the channel owner, then Content > Releases.',
  'Locate the release containing this video and verify every track belongs to the intended request. A video match alone does not authorize removal of a whole release.',
  `If the owner confirms it is not their release, select "${FOREIGN_OPTION}"`,
  `If the owner confirms it is theirs but wants it removed from the channel, select "${OWNED_OPTION}"`,
  'Only submit after the owner approves that exact release and request. Track the request status in the Releases tab.',
  'If the release is absent or identity is uncertain, stop and ask the channel operator or distributor to review it.',
] as const;

export const REMOVAL_PLAYBOOK: readonly RemovalPlaybookEntry[] = [
  {
    classification: 'foreign_upload_on_linked_channel',
    summary: 'Review a possible release mismatch on a linked channel.',
    steps: REVIEW_STEPS,
    referenceUrl: RELEASE_HELP,
    apiCapableToday: false,
  },
  {
    classification: 'wrong_release_attribution',
    summary:
      'Review a possible release mismatch from a channel outside the supplied channel lists.',
    steps: REVIEW_STEPS,
    referenceUrl: RELEASE_HELP,
    apiCapableToday: false,
  },
  {
    classification: 'owned_unwanted',
    summary:
      'Review a flagged upload on an artist-controlled channel; verify release ownership separately.',
    steps: REVIEW_STEPS,
    referenceUrl: RELEASE_HELP,
    apiCapableToday: false,
  },
];

export function playbookEntryFor(
  classification: ForeignContentClassification
): RemovalPlaybookEntry {
  const entry = REMOVAL_PLAYBOOK.find(
    candidate => candidate.classification === classification
  );
  if (!entry) throw new Error(`No playbook entry for ${classification}`);
  return entry;
}

export interface RemovalRequestDraft {
  readonly recipient: string;
  readonly subject: string;
  readonly body: string;
  readonly requiresOwnerApproval: true;
}

interface DraftContext {
  readonly artistName: string;
  readonly artistChannelUrl: string;
}

/**
 * Prepare neutral review copy. Detection never supplies an ownership verdict.
 * The owner must edit and approve the exact release request before submission.
 * Deterministic text is not a persisted audit record or submission idempotency.
 */
export function buildRemovalRequestDraft(
  contentCase: ForeignContentCase,
  context: DraftContext
): RemovalRequestDraft {
  const entry = playbookEntryFor(contentCase.classification);
  return {
    recipient: 'Channel owner review; then YouTube Studio > Content > Releases',
    subject: `Review release attribution: "${contentCase.title}" (${contentCase.videoId})`,
    body: [
      'DRAFT — owner identity review and approval required before submission.',
      `Artist: ${context.artistName}`,
      `My channel: ${context.artistChannelUrl}`,
      `Video: "${contentCase.title}" - https://www.youtube.com/watch?v=${encodeURIComponent(contentCase.videoId)}`,
      `Uploaded by: ${contentCase.owningChannelTitle ?? 'unknown'} (${contentCase.owningChannelId})`,
      `Evidence: ${contentCase.evidence}`,
      `Review: ${entry.summary}`,
      contentCase.catalogConflict
        ? 'STOP: the owner flag conflicts with the verified catalog. Reconcile that evidence before preparing a removal request.'
        : 'Catalog absence and channel ownership do not prove this release belongs to another artist.',
      'Confirm the release identity and all affected tracks with the owner. Record the exact release and intended channel-only removal before choosing the appropriate option in Studio.',
      `Guidance: ${entry.referenceUrl}`,
    ].join('\n'),
    requiresOwnerApproval: true,
  };
}
