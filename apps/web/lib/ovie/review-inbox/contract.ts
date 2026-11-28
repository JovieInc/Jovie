import {
  INTERACTION_CASE_CONTRACT,
  type InteractionCase,
} from '@/lib/ovie/interaction-case';

/** Versioned review decision envelope; not a second approval authority. */
export const REVIEW_INBOX_DECISION_CONTRACT =
  'jovie.review-inbox-decision/v1' as const;

export const REVIEW_INBOX_PILOT_TENANT = 'pilot-synthetic-photo' as const;

export type ReviewInboxViewMode = 'canvas' | 'list' | 'editorial' | 'artboard';

/** Normalized pin on immutable asset bytes (0–1 in oriented image space). */
export interface ReviewInboxPin {
  readonly id: string;
  readonly assetDigest: string;
  readonly revision: string;
  readonly x: number;
  readonly y: number;
  readonly note: string;
  readonly author: 'founder' | 'agent';
}

/** One normalized point (0–1 in oriented image space). */
export type ReviewInboxPoint = readonly [x: number, y: number];

/** Freehand mark drawn on immutable asset bytes, scoped like a pin. */
export interface ReviewInboxStroke {
  readonly id: string;
  readonly assetDigest: string;
  readonly revision: string;
  readonly points: readonly ReviewInboxPoint[];
  readonly author: 'founder' | 'agent';
}

/** Free-text comment saved with a revision request. */
export interface ReviewInboxComment {
  readonly id: string;
  readonly revision: string;
  readonly body: string;
  readonly author: 'founder' | 'agent';
}

/** Bounds that keep one stored case small in the operating KV. */
export const REVIEW_INBOX_MARK_LIMITS = {
  pins: 50,
  strokes: 50,
  pointsPerStroke: 400,
  noteChars: 500,
  commentChars: 2000,
} as const;

/** Marks a canvas edits for one asset revision. */
export interface ReviewInboxMarks {
  readonly pins: readonly ReviewInboxPin[];
  readonly strokes: readonly ReviewInboxStroke[];
}

export interface ReviewInboxCandidate {
  readonly revision: string;
  readonly label: string;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly contentDigest: string;
}

export type ReviewInboxLifecycle =
  | 'awaiting_review'
  | 'changes_requested'
  | 'accepted';

export interface ReviewInboxPilotCase {
  readonly contract: typeof INTERACTION_CASE_CONTRACT;
  readonly id: typeof REVIEW_INBOX_PILOT_TENANT;
  readonly kind: 'design';
  readonly title: string;
  readonly recommendation: string;
  readonly approvalDisclosure: string;
  readonly owner: 'founder';
  readonly state: InteractionCase['state'];
  readonly priority: number;
  readonly createdAt: string;
  readonly lifecycle: ReviewInboxLifecycle;
  readonly activeRevision: string;
  readonly candidates: readonly ReviewInboxCandidate[];
  readonly pins: readonly ReviewInboxPin[];
  readonly strokes: readonly ReviewInboxStroke[];
  readonly comments: readonly ReviewInboxComment[];
  readonly acceptedRevision: string | null;
  readonly privateLibraryReceipt: string | null;
}

export type ReviewInboxCommand =
  | 'favorite'
  | 'request_changes'
  | 'accept_version'
  | 'publish'
  | 'spend';

export interface ReviewInboxDecisionBody {
  readonly contract: typeof REVIEW_INBOX_DECISION_CONTRACT;
  readonly tenant: typeof REVIEW_INBOX_PILOT_TENANT;
  readonly caseId: typeof REVIEW_INBOX_PILOT_TENANT;
  readonly revision: string;
  readonly command: ReviewInboxCommand;
  readonly actionId: string;
  readonly acceptRevision?: string;
  readonly pins?: readonly Omit<ReviewInboxPin, 'author'>[];
  readonly strokes?: readonly Omit<ReviewInboxStroke, 'author'>[];
  readonly notes?: string;
}

export interface ReviewInboxDecisionReceipt {
  readonly contract: typeof REVIEW_INBOX_DECISION_CONTRACT;
  readonly actionId: string;
  readonly command: ReviewInboxCommand;
  readonly revision: string;
  readonly ack: true;
  readonly case: ReviewInboxPilotCase;
}
