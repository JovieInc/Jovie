import { describe, expect, it } from 'vitest';
import { respondToSummerControl } from '@/app/api/summer/control/route';

describe('POST /api/summer/control', () => {
  it('fails closed when unauthenticated', async () => {
    const response = respondToSummerControl({
      authenticated: false,
      isAdmin: false,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false });
  });

  it('accepts an authenticated founder-scoped call', async () => {
    const response = respondToSummerControl({
      authenticated: true,
      isAdmin: true,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      surface: 'summer-jovie-control',
    });
  });
});
