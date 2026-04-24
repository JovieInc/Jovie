/**
 * Unit tests for the homepage intent store.
 *
 * Covers the pure logic in isolation: UUID + TTL + sanitization + multi-tab
 * id-keyed storage + consume semantics. The E2E suite
 * (tests/e2e/homepage-intent.spec.ts) verifies the browser-integration side
 * (viewport-split nav, URL encoding, /onboarding restore).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeHomepageIntent,
  createHomepageIntent,
  HOMEPAGE_ACTIVE_INTENT_KEY,
  HOMEPAGE_INTENT_MAX_CHARS,
  HOMEPAGE_INTENT_TTL_MS,
  HOMEPAGE_INTENTS_KEY,
  persistHomepageIntent,
  pruneExpiredIntents,
  readHomepageIntent,
  sanitizeHomepagePrompt,
} from '@/components/homepage/intent-store';

function baseInput() {
  return {
    finalPrompt: 'Plan a release for my next single',
    pillId: 'plan_a_release' as const,
    pillLabel: 'Plan a release',
    insertedPrompt: 'Plan a release for ',
  };
}

describe('sanitizeHomepagePrompt', () => {
  it('trims whitespace', () => {
    expect(sanitizeHomepagePrompt('   hello   ')).toBe('hello');
  });

  it('strips ASCII control characters', () => {
    const raw = `hello\u0000world\u001F\u007Ftest`;
    expect(sanitizeHomepagePrompt(raw)).toBe('helloworldtest');
  });

  it('caps at HOMEPAGE_INTENT_MAX_CHARS', () => {
    const long = 'a'.repeat(500);
    const out = sanitizeHomepagePrompt(long);
    expect(out.length).toBe(HOMEPAGE_INTENT_MAX_CHARS);
  });

  it('preserves emoji and unicode', () => {
    expect(sanitizeHomepagePrompt('hello 🎸 world')).toBe('hello 🎸 world');
  });
});

describe('createHomepageIntent', () => {
  it('generates a uuid id and valid timestamps', () => {
    const intent = createHomepageIntent(baseInput());
    expect(intent.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(typeof intent.createdAt).toBe('string');
    expect(intent.expiresAt).toBeGreaterThan(Date.now());
    expect(intent.expiresAt - Date.now()).toBeLessThanOrEqual(
      HOMEPAGE_INTENT_TTL_MS + 1000
    );
  });

  it('is pure — does not touch storage', () => {
    window.localStorage.clear();
    createHomepageIntent(baseInput());
    expect(window.localStorage.getItem(HOMEPAGE_INTENTS_KEY)).toBeNull();
  });

  it('sanitizes the prompt on creation', () => {
    const intent = createHomepageIntent({
      ...baseInput(),
      finalPrompt: `  contains\u0000control  `,
    });
    expect(intent.finalPrompt).toBe('containscontrol');
  });
});

describe('persist → read → consume', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('round-trips a single intent', () => {
    const intent = createHomepageIntent(baseInput());
    persistHomepageIntent(intent);
    expect(readHomepageIntent(intent.id)).toEqual(intent);
  });

  it('stores id → intent map under the intents key', () => {
    const intent = createHomepageIntent(baseInput());
    persistHomepageIntent(intent);
    const raw = window.localStorage.getItem(HOMEPAGE_INTENTS_KEY);
    const map = JSON.parse(raw as string);
    expect(map[intent.id]).toEqual(intent);
  });

  it('writes the active-id sentinel in sessionStorage', () => {
    const intent = createHomepageIntent(baseInput());
    persistHomepageIntent(intent);
    expect(window.sessionStorage.getItem(HOMEPAGE_ACTIVE_INTENT_KEY)).toBe(
      intent.id
    );
  });

  it('preserves two intents across submits (multi-tab fix)', () => {
    const a = createHomepageIntent({
      ...baseInput(),
      finalPrompt: 'release page',
    });
    const b = createHomepageIntent({
      ...baseInput(),
      finalPrompt: 'album art',
    });
    persistHomepageIntent(a);
    persistHomepageIntent(b);
    expect(readHomepageIntent(a.id)?.finalPrompt).toBe('release page');
    expect(readHomepageIntent(b.id)?.finalPrompt).toBe('album art');
  });

  it('consumeHomepageIntent deletes by id', () => {
    const intent = createHomepageIntent(baseInput());
    persistHomepageIntent(intent);
    consumeHomepageIntent(intent.id);
    expect(readHomepageIntent(intent.id)).toBeNull();
  });

  it('consuming an unrelated id leaves other intents intact', () => {
    const a = createHomepageIntent(baseInput());
    const b = createHomepageIntent(baseInput());
    persistHomepageIntent(a);
    persistHomepageIntent(b);
    consumeHomepageIntent(a.id);
    expect(readHomepageIntent(a.id)).toBeNull();
    expect(readHomepageIntent(b.id)).not.toBeNull();
  });
});

describe('TTL behavior', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for expired intents', () => {
    const intent = createHomepageIntent(baseInput());
    persistHomepageIntent(intent);
    vi.setSystemTime(Date.now() + HOMEPAGE_INTENT_TTL_MS + 1_000);
    expect(readHomepageIntent(intent.id)).toBeNull();
  });

  it('pruneExpiredIntents drops expired entries, keeps live ones', () => {
    const a = createHomepageIntent(baseInput());
    persistHomepageIntent(a);
    vi.setSystemTime(Date.now() + HOMEPAGE_INTENT_TTL_MS + 1_000);
    const b = createHomepageIntent(baseInput());
    persistHomepageIntent(b); // pruneExpired is called during persist
    expect(readHomepageIntent(a.id)).toBeNull();
    expect(readHomepageIntent(b.id)).not.toBeNull();
    // Explicit prune is idempotent.
    pruneExpiredIntents();
    expect(readHomepageIntent(b.id)).not.toBeNull();
  });
});

describe('defensive reads', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns null for empty id', () => {
    expect(readHomepageIntent('')).toBeNull();
  });

  it('returns null when storage is empty', () => {
    expect(readHomepageIntent('nonexistent-id')).toBeNull();
  });

  it('returns null when storage contains garbage', () => {
    window.localStorage.setItem(HOMEPAGE_INTENTS_KEY, 'not-json-at-all');
    expect(readHomepageIntent('any-id')).toBeNull();
  });

  it('returns null when an entry is missing required fields', () => {
    window.localStorage.setItem(
      HOMEPAGE_INTENTS_KEY,
      JSON.stringify({
        bad: { id: 'bad', finalPrompt: 'x' }, // missing expiresAt, createdAt, source
      })
    );
    expect(readHomepageIntent('bad')).toBeNull();
  });
});
