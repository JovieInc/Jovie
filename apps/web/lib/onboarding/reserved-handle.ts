import 'server-only';

import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  buildNumberedHandleSuggestions,
  HANDLE_SUGGESTION_LIMIT,
  type HandleAvailabilityResult,
  normalizeHandleCandidate,
  toHandleAvailabilityResult,
} from '@/lib/onboarding/handle-availability';
import { assertAuthenticatedOnboardingUser } from '@/lib/onboarding/ownership-gate';
import { normalizeUsername, validateUsername } from '@/lib/validation/username';

const MAX_SUFFIX_ATTEMPTS = 30;

function slugFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replaceAll(/\s+/g, ' ');
}

export function buildHandleCandidates(name: string): string[] {
  const normalizedName = slugFromName(name);
  const words = normalizedName.split(' ').filter(Boolean);

  const combined = words.join('');
  const hyphenated = words.join('-');
  const firstWord = words[0] ?? '';

  const candidates = [combined, hyphenated, firstWord]
    .map(value => normalizeUsername(value))
    .map(value => (value && /^[a-z]/.test(value) ? value : `artist-${value}`))
    .map(value =>
      value.replaceAll(/-{2,}/g, '-').replace(/^-+/, '').replace(/-+$/, '')
    )
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .filter(value => validateUsername(value).isValid);

  if (!candidates.includes('artist')) {
    candidates.push('artist');
  }

  return candidates;
}

async function findTakenHandles(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const rows = await db
    .select({ normalized: creatorProfiles.usernameNormalized })
    .from(creatorProfiles)
    .where(inArray(creatorProfiles.usernameNormalized, candidates));
  return new Set(rows.map(r => r.normalized));
}

/**
 * Check a specific handle's availability and surface numbered alternatives
 * when taken. Never silently replaces the requested handle — alternatives
 * live only in `suggestedAlternatives` for explicit UI labeling.
 */
export async function checkOnboardingHandleAvailability(
  requestedHandle: string
): Promise<HandleAvailabilityResult> {
  const handle = normalizeHandleCandidate(requestedHandle);
  const formatGate = toHandleAvailabilityResult({ handle });
  if (
    formatGate.reason === 'invalid_format' ||
    formatGate.reason === 'reserved'
  ) {
    return formatGate;
  }

  const numbered = buildNumberedHandleSuggestions(handle, {
    limit: HANDLE_SUGGESTION_LIMIT + 5,
  });
  const taken = await findTakenHandles([handle, ...numbered]);
  const available = !taken.has(handle);
  const suggestedAlternatives = available
    ? undefined
    : buildNumberedHandleSuggestions(handle, {
        limit: HANDLE_SUGGESTION_LIMIT,
        taken,
      });

  return toHandleAvailabilityResult({
    handle,
    available,
    suggestedAlternatives,
  });
}

/**
 * Pick an available onboarding handle candidate.
 *
 * Auth is required: callers that surface "locked in / reserved" success must
 * only reach this after ownership verification. Fail closed for anonymous.
 */
export async function reserveOnboardingHandle(
  name: string,
  userId: string
): Promise<string> {
  assertAuthenticatedOnboardingUser(userId);

  const bases = buildHandleCandidates(name);

  // Build all candidates up front, then check availability in a single query
  const candidates: string[] = [];

  for (const base of bases) {
    candidates.push(base);
    for (let suffix = 1; suffix <= MAX_SUFFIX_ATTEMPTS; suffix++) {
      const candidate = `${base}${suffix}`;
      if (validateUsername(candidate).isValid) {
        candidates.push(candidate);
      }
    }
  }

  // Single batch query instead of up to 30+ sequential queries
  const taken = await findTakenHandles(candidates);

  // Return the first available candidate in priority order
  for (const candidate of candidates) {
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `artist${Date.now().toString().slice(-6)}`;
}
