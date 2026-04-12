/**
 * Profile Quality Gate
 *
 * Pure validation module that evaluates whether an auto-created profile
 * meets minimum quality criteria before going live (isPublic: true).
 *
 * Profiles that fail are quarantined (isPublic: false) and can be promoted
 * on re-ingest when quality improves.
 */

/**
 * Check if a display name would look embarrassing on a public profile page.
 *
 * Returns true for names that are:
 * - Empty or whitespace-only
 * - Raw URLs (containing http:// or https://)
 * - Starting with "www."
 * - The literal strings "undefined" or "null" (case-insensitive)
 * - Numeric-only (e.g., "4829173")
 * - Starting with "artist_" (unresolved Spotify artist ID prefix)
 */
export function isEmbarrassingDisplayName(name: string): boolean {
  const trimmed = name.trim();

  if (trimmed.length === 0) return true;

  if (trimmed.includes('http://') || trimmed.includes('https://')) return true;

  if (trimmed.toLowerCase().startsWith('www.')) return true;

  const lower = trimmed.toLowerCase();
  if (lower === 'undefined' || lower === 'null') return true;

  if (/^\d+$/.test(trimmed)) return true;

  if (trimmed.startsWith('artist_')) return true;

  return false;
}

export interface QualityGateInput {
  displayName: string;
  avatarUrl: string | null;
  linkCount: number;
}

export interface QualityGateResult {
  isPublic: boolean;
  quarantineReasons: string[];
}

/**
 * Evaluate whether a profile meets minimum quality criteria for public display.
 *
 * A profile is public-ready when ALL of:
 * 1. Display name is not embarrassing
 * 2. Has an avatar (avatarUrl is a non-empty string)
 * 3. Has at least one link
 *
 * @param input - Profile data to evaluate
 * @returns Quality gate result with isPublic flag and quarantine reasons
 */
export function evaluateProfileQuality(
  input: QualityGateInput
): QualityGateResult {
  const reasons: string[] = [];

  if (isEmbarrassingDisplayName(input.displayName)) {
    reasons.push(
      `Display name "${input.displayName}" does not meet quality bar`
    );
  }

  if (!input.avatarUrl || input.avatarUrl.trim().length === 0) {
    reasons.push('Missing avatar image');
  }

  if (input.linkCount < 1) {
    reasons.push('No links extracted');
  }

  return {
    isPublic: reasons.length === 0,
    quarantineReasons: reasons,
  };
}
