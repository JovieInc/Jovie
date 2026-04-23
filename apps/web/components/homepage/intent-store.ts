import {
  HOMEPAGE_INTENT_EXPERIMENT_ID,
  HOMEPAGE_INTENT_VARIANT_ID,
  type HomepageIntent,
  type HomepagePillId,
} from './intent';

/**
 * ID-keyed intent store. Replaces the single-key overwrite pattern that caused
 * multi-tab data loss (Tab A prompt → Tab B prompt submit → Tab A resumes with
 * Tab B's prompt).
 *
 * Layout:
 *   localStorage["jovie_homepage_intents"] = { [id]: StoredIntent, ... }
 *   sessionStorage["jovie_active_homepage_intent_id"] = id  (per-tab latest)
 *
 * Each intent carries a UUID and a 30-min TTL. Reads validate TTL; expired
 * intents are dropped. Onboarding consumes by id and deletes after render.
 */

export const HOMEPAGE_INTENTS_KEY = 'jovie_homepage_intents';
export const HOMEPAGE_ACTIVE_INTENT_KEY = 'jovie_active_homepage_intent_id';
export const HOMEPAGE_INTENT_TTL_MS = 30 * 60 * 1000;
export const HOMEPAGE_INTENT_MAX_CHARS = 140;

/**
 * Shared truncation length for rendering the prompt hint back to the user
 * (modal status row + onboarding restorer). Keep both surfaces in lockstep
 * so the visible copy doesn't change mid-flow when the user moves from
 * signup → onboarding.
 */
export const HOMEPAGE_PROMPT_HINT_TRUNCATE = 60;

export interface StoredHomepageIntent extends HomepageIntent {
  readonly id: string;
  readonly expiresAt: number;
}

interface StoredMap {
  readonly [id: string]: StoredHomepageIntent;
}

interface CreateInput {
  readonly finalPrompt: string;
  readonly pillId: HomepagePillId | null;
  readonly pillLabel: string | null;
  readonly insertedPrompt: string | null;
}

/**
 * Strip ASCII control characters, trim whitespace, cap length. Must be used on
 * both write and any user-facing render that originates from storage, because
 * storage can be mutated by devtools or cross-origin content.
 */
export function sanitizeHomepagePrompt(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, HOMEPAGE_INTENT_MAX_CHARS);
}

function hasWindow(): boolean {
  return globalThis.window !== undefined;
}

function getLocalStorage(): Storage | null {
  if (!hasWindow()) return null;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function getSessionStorage(): Storage | null {
  if (!hasWindow()) return null;
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function safeReadMap(): StoredMap {
  const storage = getLocalStorage();
  if (!storage) return {};
  const raw = storage.getItem(HOMEPAGE_INTENTS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as StoredMap;
    }
    return {};
  } catch {
    return {};
  }
}

function safeWriteMap(map: StoredMap): void {
  const storage = getLocalStorage();
  if (!storage) {
    throw new Error('homepage-intent-store: localStorage is not available');
  }
  storage.setItem(HOMEPAGE_INTENTS_KEY, JSON.stringify(map));
}

function isValidIntent(candidate: unknown): candidate is StoredHomepageIntent {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.finalPrompt === 'string' &&
    typeof obj.expiresAt === 'number' &&
    typeof obj.createdAt === 'string' &&
    obj.source === 'homepage'
  );
}

/**
 * Pure — generates a new intent with a UUID and TTL. Does not touch storage.
 * Callers should pass the result to `persistHomepageIntent`.
 */
export function createHomepageIntent(input: CreateInput): StoredHomepageIntent {
  const now = Date.now();
  const id = crypto.randomUUID();
  return {
    id,
    source: 'homepage',
    finalPrompt: sanitizeHomepagePrompt(input.finalPrompt),
    pillId: input.pillId,
    pillLabel: input.pillLabel,
    insertedPrompt: input.insertedPrompt,
    experimentId: HOMEPAGE_INTENT_EXPERIMENT_ID,
    variantId: HOMEPAGE_INTENT_VARIANT_ID,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + HOMEPAGE_INTENT_TTL_MS,
  };
}

/**
 * Writes the intent into the ID-keyed store and marks it as the per-tab
 * active intent. Opportunistically prunes expired entries. Throws on storage
 * failure so callers can surface the failure via analytics.
 */
export function persistHomepageIntent(intent: StoredHomepageIntent): void {
  const map = pruneExpiredFromMap(safeReadMap());
  const next: StoredMap = { ...map, [intent.id]: intent };
  safeWriteMap(next);
  const session = getSessionStorage();
  if (session) {
    try {
      session.setItem(HOMEPAGE_ACTIVE_INTENT_KEY, intent.id);
    } catch {
      // sessionStorage quota or private mode — non-fatal; localStorage carries the intent.
    }
  }
}

/**
 * Reads an intent by id. Returns null if missing, expired, or storage is
 * unavailable. Does not throw.
 */
export function readHomepageIntent(id: string): StoredHomepageIntent | null {
  if (!id) return null;
  const map = safeReadMap();
  const candidate = map[id];
  if (!isValidIntent(candidate)) return null;
  if (candidate.expiresAt <= Date.now()) return null;
  return candidate;
}

/**
 * Deletes an intent by id. Safe to call when the id is missing or storage is
 * unavailable. Clears the active-intent sentinel if it points to this id.
 */
export function consumeHomepageIntent(id: string): void {
  if (!id) return;
  const storage = getLocalStorage();
  if (storage) {
    const map = safeReadMap();
    if (id in map) {
      const { [id]: _removed, ...rest } = map;
      try {
        safeWriteMap(rest);
      } catch {
        // storage disappeared between read and write — non-fatal.
      }
    }
  }
  const session = getSessionStorage();
  if (session) {
    try {
      if (session.getItem(HOMEPAGE_ACTIVE_INTENT_KEY) === id) {
        session.removeItem(HOMEPAGE_ACTIVE_INTENT_KEY);
      }
    } catch {
      // ignore
    }
  }
}

function pruneExpiredFromMap(map: StoredMap): StoredMap {
  const now = Date.now();
  const next: Record<string, StoredHomepageIntent> = {};
  for (const [id, intent] of Object.entries(map)) {
    if (isValidIntent(intent) && intent.expiresAt > now) {
      next[id] = intent;
    }
  }
  return next;
}

/**
 * Removes expired intents from storage. Exposed for tests and explicit callers.
 * Write failures are swallowed — pruning is best-effort.
 */
export function pruneExpiredIntents(): void {
  const storage = getLocalStorage();
  if (!storage) return;
  const pruned = pruneExpiredFromMap(safeReadMap());
  try {
    safeWriteMap(pruned);
  } catch {
    // ignore
  }
}
