import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminHudRedirectPage from '@/app/app/(shell)/admin/hud/page';
import { APP_ROUTES } from '@/constants/routes';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  })
);
const accessMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: accessMock,
}));

describe('/hud default door', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    accessMock.mockClear();
  });

  it('checks admin access, then lands on Ovie Home', async () => {
    await expect(AdminHudRedirectPage()).rejects.toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.OV}`
    );
    expect(accessMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.OV);
  });
});
