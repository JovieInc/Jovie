/**
 * Canonical handle-availability contract for onboarding.
 *
 * Every surface (handle check card, chat helpers, reserved-handle suggestions)
 * must present availability through `toHandleAvailabilityResult` so the UI
 * cannot show available + taken for the same handle, and numbered alternatives
 * are always explicit `suggestedAlternatives` (never silent replacements).
 */

import {
  normalizeUsername,
  RESERVED_USERNAMES,
  validateUsernameCore,
} from '@/lib/validation/username-core';

export type HandleAvailabilityReason =
  | 'available'
  | 'taken'
  | 'invalid_format'
  | 'reserved'
  | 'error'
  | 'checking'
  | 'unknown';

export interface HandleAvailabilityResult {
  /** Normalized handle the result describes (no @). */
  readonly handle: string;
  /**
   * Single boolean status. Guaranteed:
   *   available === true  ⇔ reason === 'available'
   *   available === false for every other reason (including checking/error).
   */
  readonly available: boolean;
  readonly reason: HandleAvailabilityReason;
  /**
   * Numbered / alternate handles when the requested handle is taken.
   * UI must label these as "Suggested available handle" — never swap silently.
   */
  readonly suggestedAlternatives?: readonly string[];
  /** Optional machine/user message (validation or transport errors). */
  readonly error?: string;
}

export interface ToHandleAvailabilityResultInput {
  readonly handle: string;
  /** When known from API/cache. Omit while loading. */
  readonly available?: boolean | null;
  readonly error?: string | null;
  readonly suggestedAlternatives?: readonly string[] | null;
  /** When true, treat as in-flight check (never available+taken). */
  readonly checking?: boolean;
}

const RESERVED_SET = new Set(
  RESERVED_USERNAMES.map(name => name.toLowerCase())
);

/** Max numbered alternatives surfaced to the UI. */
export const HANDLE_SUGGESTION_LIMIT = 3;

/**
 * Normalize a handle for availability checks (strip @, lowercase, trim).
 */
export function normalizeHandleCandidate(
  handle: string | null | undefined
): string {
  if (!handle) return '';
  return normalizeUsername(handle.replace(/^@+/, '').trim());
}

/**
 * Build numbered handle alternatives for a base handle (base1, base2, …).
 * Does not claim availability — callers pass known-available ones when known.
 */
export function buildNumberedHandleSuggestions(
  baseHandle: string,
  options: {
    readonly limit?: number;
    readonly taken?: ReadonlySet<string>;
    /** Start suffix (default 1). */
    readonly start?: number;
  } = {}
): string[] {
  const base = normalizeHandleCandidate(baseHandle);
  if (!base) return [];

  const limit = options.limit ?? HANDLE_SUGGESTION_LIMIT;
  const taken = options.taken;
  const start = options.start ?? 1;
  const suggestions: string[] = [];

  for (
    let suffix = start;
    suggestions.length < limit && suffix < start + 50;
    suffix++
  ) {
    const candidate = `${base}${suffix}`;
    const format = validateUsernameCore(candidate);
    if (!format.isValid) continue;
    if (taken?.has(candidate)) continue;
    if (candidate === base) continue;
    suggestions.push(candidate);
  }

  return suggestions;
}

/**
 * Single source of truth for handle availability presentation.
 *
 * Invariants:
 * - Never returns available:true with reason other than 'available'
 * - Never returns available:true while checking
 * - suggestedAlternatives only present when the requested handle is not available
 * - Invalid/reserved handles are unavailable with an explicit reason
 */
export function toHandleAvailabilityResult(
  input: ToHandleAvailabilityResultInput
): HandleAvailabilityResult {
  const handle = normalizeHandleCandidate(input.handle);

  if (!handle) {
    return {
      handle: '',
      available: false,
      reason: 'invalid_format',
      error: input.error ?? 'Handle is required',
    };
  }

  // Reserved before format: validateUsernameCore also rejects reserved names,
  // but we want the explicit `reserved` reason for UI alternatives.
  if (RESERVED_SET.has(handle)) {
    const suggestedAlternatives = sanitizeAlternatives(
      handle,
      input.suggestedAlternatives ??
        buildNumberedHandleSuggestions(handle, {
          limit: HANDLE_SUGGESTION_LIMIT,
        })
    );
    return {
      handle,
      available: false,
      reason: 'reserved',
      suggestedAlternatives,
      error: input.error ?? 'This handle is reserved',
    };
  }

  const format = validateUsernameCore(handle);
  if (!format.isValid) {
    const reservedByValidator =
      typeof format.error === 'string' && /reserved/i.test(format.error);
    return {
      handle,
      available: false,
      reason: reservedByValidator ? 'reserved' : 'invalid_format',
      error: input.error ?? format.error ?? 'Invalid handle format',
      ...(reservedByValidator
        ? {
            suggestedAlternatives: sanitizeAlternatives(
              handle,
              input.suggestedAlternatives ??
                buildNumberedHandleSuggestions(handle, {
                  limit: HANDLE_SUGGESTION_LIMIT,
                })
            ),
          }
        : {}),
    };
  }

  if (input.checking || input.available == null) {
    return {
      handle,
      available: false,
      reason: input.checking ? 'checking' : 'unknown',
      error: input.error ?? undefined,
    };
  }

  if (input.error && input.available !== true) {
    return {
      handle,
      available: false,
      reason: 'error',
      error: input.error,
      suggestedAlternatives: sanitizeAlternatives(
        handle,
        input.suggestedAlternatives
      ),
    };
  }

  if (input.available === true) {
    // Explicitly omit suggestedAlternatives when available — no dual status.
    return {
      handle,
      available: true,
      reason: 'available',
    };
  }

  // Taken (or not available).
  const suggestedAlternatives = sanitizeAlternatives(
    handle,
    input.suggestedAlternatives ??
      buildNumberedHandleSuggestions(handle, { limit: HANDLE_SUGGESTION_LIMIT })
  );

  return {
    handle,
    available: false,
    reason: 'taken',
    suggestedAlternatives,
    error: input.error ?? undefined,
  };
}

function sanitizeAlternatives(
  requested: string,
  alternatives: readonly string[] | null | undefined
): readonly string[] | undefined {
  if (!alternatives || alternatives.length === 0) return undefined;

  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const raw of alternatives) {
    const candidate = normalizeHandleCandidate(raw);
    if (!candidate || candidate === requested) continue;
    if (seen.has(candidate)) continue;
    if (!validateUsernameCore(candidate).isValid) continue;
    seen.add(candidate);
    cleaned.push(candidate);
    if (cleaned.length >= HANDLE_SUGGESTION_LIMIT) break;
  }

  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * UI copy constant — every auto-suffixed suggestion must use this label.
 * Never silently replace the requested handle in the primary slot.
 */
export const SUGGESTED_AVAILABLE_HANDLE_LABEL = 'Suggested available handle';

/**
 * Whether two results describe contradictory status for the same handle.
 * Used by tests and optional UI guards.
 */
export function isContradictoryHandleStatus(
  a: HandleAvailabilityResult,
  b: HandleAvailabilityResult
): boolean {
  if (a.handle !== b.handle) return false;
  if (a.available === b.available) return false;
  // available true vs false for same handle is a contradiction
  return true;
}
