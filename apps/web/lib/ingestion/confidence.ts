import type { IngestionSourceType, SocialLinkState } from '@/types/db';

type ConfidenceSignal =
  | 'manual_user'
  | 'manual_admin'
  | 'kept_after_claim'
  | 'ingestion_profile_link'
  | 'linktree_profile_link'
  | 'laylo_profile_link'
  | 'beacons_profile_link'
  | 'youtube_about_link'
  | 'youtube_official_artist'
  | 'instagram_bio'
  | 'spotify_presence'
  | 'handle_similarity';

const SIGNAL_WEIGHTS: Record<ConfidenceSignal, number> = {
  manual_user: 0.6,
  manual_admin: 0.5,
  kept_after_claim: 0.2,
  ingestion_profile_link: 0.1,
  linktree_profile_link: 0.2,
  laylo_profile_link: 0.2,
  beacons_profile_link: 0.2,
  youtube_about_link: 0.3,
  youtube_official_artist: 0.15,
  instagram_bio: 0.25,
  spotify_presence: 0.3,
  handle_similarity: 0.15,
};

const SOURCE_BONUS = 0.15;
const ACTIVE_THRESHOLD = 0.7;
const SUGGESTED_THRESHOLD = 0.3;

/**
 * Extract the handle portion from a URL for comparison.
 */
function extractHandleFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const first = parsed.pathname.split('/').find(Boolean);
    if (!first) return null;
    return first.replace(/^@/, '').toLowerCase();
  } catch {
    return null;
  }
}

export interface ConfidenceInput {
  sourceType: IngestionSourceType;
  signals?: Array<ConfidenceSignal | string>;
  sources?: Array<string>;
  usernameNormalized?: string | null;
  url?: string;
  existingConfidence?: number | null;
}

export function computeLinkConfidence(input: ConfidenceInput): {
  confidence: number;
  state: SocialLinkState;
} {
  const signals = new Set<ConfidenceSignal>(
    (input.signals ?? []).filter((s): s is ConfidenceSignal =>
      Object.hasOwn(SIGNAL_WEIGHTS, s)
    )
  );
  const sources = new Set<string>(input.sources ?? []);

  // Base weight by source type
  if (input.sourceType === 'manual') {
    signals.add('manual_user');
  } else if (input.sourceType === 'admin') {
    signals.add('manual_admin');
  } else {
    // ingested base: small starting value via linktree or similar signals
    // (handled below through explicit signals)
  }

  // Handle similarity bonus
  if (input.usernameNormalized) {
    const handle = extractHandleFromUrl(input.url);
    if (handle && handle === input.usernameNormalized.toLowerCase()) {
      signals.add('handle_similarity');
    }
  }

  let score = 0;
  signals.forEach(signal => {
    score += SIGNAL_WEIGHTS[signal] ?? 0;
  });

  if (signals.has('manual_user')) {
    score = Math.max(score, 0.75);
  }

  if (signals.has('manual_admin')) {
    score = Math.max(score, 0.7);
  }

  // Multi-source bonus (beyond first source)
  if (sources.size > 1) {
    score += SOURCE_BONUS * (sources.size - 1);
  }

  if (typeof input.existingConfidence === 'number') {
    score = Math.max(score, input.existingConfidence);
  }

  const clamped = Math.min(1, Math.max(0, Number(score.toFixed(2))));

  const state: SocialLinkState = (() => {
    if (clamped >= ACTIVE_THRESHOLD) return 'active';
    if (clamped >= SUGGESTED_THRESHOLD) return 'suggested';
    return 'rejected';
  })();

  return { confidence: clamped, state };
}
