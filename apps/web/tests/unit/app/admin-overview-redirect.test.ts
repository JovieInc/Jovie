import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminOverviewRedirectPage from '@/app/app/(shell)/admin/page';
import { APP_ROUTES } from '@/constants/routes';

const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  })
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('/app/ov compatibility alias', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirects Overview to canonical Ops', () => {
    expect(() => AdminOverviewRedirectPage()).toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.HUD}`
    );
    expect(redirectMock).toHaveBeenCalledWith(APP_ROUTES.HUD);
  });
});
