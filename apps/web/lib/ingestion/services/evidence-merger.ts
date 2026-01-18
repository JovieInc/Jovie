/**
 * Evidence Merger Service
 *
 * Handles merging evidence from multiple sources with type-safe validation.
 */

/**
 * Validated evidence with sources and signals.
 */
export interface ValidatedEvidence {
  sources: string[];
  signals: string[];
}

/**
 * Validates that an array contains only strings.
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Safely extracts string array from record or returns empty array.
 */
function extractStringArray(
  record: Record<string, unknown> | null,
  key: 'sources' | 'signals'
): string[] {
  if (!record || typeof record !== 'object') {
    return [];
  }

  const value = record[key];
  return isStringArray(value) ? value : [];
}

/**
 * Merge evidence from existing and incoming sources.
 * Combines sources and signals arrays while eliminating duplicates.
 *
 * @param existing - Existing evidence record (may be null or invalid)
 * @param incoming - New evidence to merge
 * @returns Validated evidence with combined sources and signals
 */
export function mergeEvidence(
  existing: Record<string, unknown> | null,
  incoming?: { sources?: string[]; signals?: string[] }
): ValidatedEvidence {
  const baseSources = extractStringArray(existing, 'sources');
  const baseSignals = extractStringArray(existing, 'signals');

  const nextSources = new Set([...baseSources, ...(incoming?.sources ?? [])]);
  const nextSignals = new Set([...baseSignals, ...(incoming?.signals ?? [])]);

  return {
    sources: Array.from(nextSources),
    signals: Array.from(nextSignals),
  };
}

/**
 * Ensures evidence has at least default values for ingestion.
 * Used when creating new links without explicit evidence.
 *
 * @param evidence - Validated evidence
 * @param defaults - Default values to use if empty
 * @returns Evidence with defaults applied
 */
export function ensureEvidenceDefaults(
  evidence: ValidatedEvidence,
  defaults: { sources: string[]; signals: string[] }
): ValidatedEvidence {
  return {
    sources:
      evidence.sources && evidence.sources.length > 0
        ? evidence.sources
        : defaults.sources,
    signals:
      evidence.signals && evidence.signals.length > 0
        ? evidence.signals
        : defaults.signals,
  };
}
