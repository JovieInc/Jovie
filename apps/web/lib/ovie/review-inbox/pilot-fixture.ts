import { INTERACTION_CASE_CONTRACT } from '@/lib/ovie/interaction-case';
import type { ReviewInboxPilotCase } from './contract';
import { REVIEW_INBOX_PILOT_TENANT } from './contract';

/** Immutable byte digests for public fixture PNGs (sha256 of file bytes). */
export const PILOT_V1_DIGEST =
  'f8306bb84b157f8ededf14b46d6ef20add039ae9af5e4a5392779a0ae7cc5db7';
export const PILOT_V2_DIGEST =
  'a6caa04828e8c62306395c862011be06e5d9dafe91cdb5239ba55266c18caf07';

const V1_SRC = '/product-screenshots/profile-state-capture.png';
const V2_SRC = '/product-screenshots/profile-state-release.png';

/** Initial pilot case: v1 active, both candidates visible for comparison. */
export function createPilotReviewCase(
  now = '2026-11-22T00:00:00.000Z'
): ReviewInboxPilotCase {
  return {
    contract: INTERACTION_CASE_CONTRACT,
    id: REVIEW_INBOX_PILOT_TENANT,
    kind: 'design',
    title: 'Profile hero photo (synthetic pilot)',
    recommendation:
      'Accept v2 after confirming pin feedback was addressed on the hero crop.',
    approvalDisclosure:
      'Accepting stores this revision in the private test library only. Nothing is published, spent, or transferred.',
    owner: 'founder',
    state: 'needs_you',
    priority: 0,
    createdAt: now,
    lifecycle: 'awaiting_review',
    activeRevision: 'v1',
    candidates: [
      {
        revision: 'v1',
        label: 'Candidate A',
        src: V1_SRC,
        width: 1280,
        height: 720,
        contentDigest: PILOT_V1_DIGEST,
      },
      {
        revision: 'v2',
        label: 'Candidate B',
        src: V2_SRC,
        width: 1280,
        height: 720,
        contentDigest: PILOT_V2_DIGEST,
      },
    ],
    pins: [],
    acceptedRevision: null,
    privateLibraryReceipt: null,
  };
}
