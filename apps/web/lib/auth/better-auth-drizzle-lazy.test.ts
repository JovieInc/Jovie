import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('better-auth drizzle adapter construction', () => {
  it('does not require DATABASE_URL at module load', async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      vi.resetModules();
      await expect(import('@/lib/auth/better-auth')).resolves.toMatchObject({
        auth: expect.anything(),
      });
    } finally {
      if (previous === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = previous;
      }
    }
  });
});
