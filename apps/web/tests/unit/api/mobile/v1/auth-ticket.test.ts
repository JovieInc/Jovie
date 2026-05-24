import { describe, expect, it } from 'vitest';

const routeModulePromise = import('@/app/api/mobile/v1/auth/ticket/route');

describe('POST /api/mobile/v1/auth/ticket', () => {
  it('does not mint Clerk tickets into native deep links anymore', async () => {
    const { POST } = await routeModulePromise;
    const response = await POST();

    expect(response.status).toBe(410);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: 'Deprecated auth ticket route',
      replacement: '/auth/start?client=ios',
    });
  });
});
