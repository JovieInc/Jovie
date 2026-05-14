/**
 * Security regression tests for /api/dev/sync-clerk env gate.
 *
 * The original DENY gate (NODE_ENV === 'production' && VERCEL_ENV === 'production')
 * left the route reachable on Vercel preview deployments where VERCEL_ENV === 'preview'.
 * The fixed ALLOW gate returns 403 for every env that is not explicitly 'development'.
 *
 * Ref: audit finding #1 (P0) — 2026-05-13.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before any import so vi.mock() can reference them
// ---------------------------------------------------------------------------
const hoisted = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  currentUser: vi.fn(),
  syncClerkIdForEmail: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.getCachedAuth,
}));

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: hoisted.currentUser,
}));

vi.mock('@/lib/auth/sync-clerk-id', () => ({
  syncClerkIdForEmail: hoisted.syncClerkIdForEmail,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/dev/sync-clerk — env gate (security)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('DENY cases — must return 403', () => {
    it('returns 403 when VERCEL_ENV=preview (staging alias)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'preview');

      const { POST } = await import('./route');
      const res = await POST();

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/outside development/i);
    });

    it('returns 403 when VERCEL_ENV=production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'production');

      const { POST } = await import('./route');
      const res = await POST();

      expect(res.status).toBe(403);
    });

    it('returns 403 when VERCEL_ENV=staging', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'staging');

      const { POST } = await import('./route');
      const res = await POST();

      expect(res.status).toBe(403);
    });

    it('returns 403 when NODE_ENV=production and VERCEL_ENV is unset', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      // Leave VERCEL_ENV unset — delete if it was stubbed previously
      vi.stubEnv('VERCEL_ENV', '');

      const { POST } = await import('./route');
      const res = await POST();

      expect(res.status).toBe(403);
    });

    it('does NOT call downstream auth or DB when blocked', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VERCEL_ENV', 'preview');

      const { POST } = await import('./route');
      await POST();

      expect(hoisted.getCachedAuth).not.toHaveBeenCalled();
      expect(hoisted.currentUser).not.toHaveBeenCalled();
      expect(hoisted.syncClerkIdForEmail).not.toHaveBeenCalled();
    });
  });

  describe('ALLOW case — development env passes the gate', () => {
    it('allows when NODE_ENV=development (unauthenticated → 401)', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VERCEL_ENV', '');

      hoisted.getCachedAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('./route');
      const res = await POST();

      // Gate passes; next check is auth → 401
      expect(res.status).toBe(401);
    });

    it('allows when VERCEL_ENV=development regardless of NODE_ENV', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('VERCEL_ENV', 'development');

      hoisted.getCachedAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('./route');
      const res = await POST();

      // Gate passes; next check is auth → 401
      expect(res.status).toBe(401);
    });
  });
});
