import { isRenderFixtureEnabled } from '@/lib/render-fixture-policy';

/**
 * Reserved fixture identity for authenticated app-shell screen-certification
 * producers (tasks: JOV-7XXX, contacts: JOV-7XXX). This is the same
 * hardcoded profile the visual-capture synthetic dashboard fallback already
 * returns for any bypass session once `E2E_FAST_ONBOARDING`/
 * `NEXT_PUBLIC_E2E_MODE` is set — see `createE2EDashboardCoreData` in
 * apps/web/app/app/(shell)/dashboard/actions/dashboard-data.ts. No real
 * creator profile can ever have this literal UUID (no signup/onboarding
 * path inserts it), so an exact match is as safe a reservation as the
 * smartlink screen-cert fixture's reserved username
 * (apps/web/app/[username]/[slug]/_lib/screen-cert-fixture.ts).
 */
export const SCREEN_CERT_APP_SHELL_PROFILE_ID =
  '00000000-0000-4000-8000-000000000102';
export const SCREEN_CERT_APP_SHELL_USER_ID =
  '00000000-0000-4000-8000-000000000101';

/**
 * Admission is double-gated, matching the smartlink fixture's contract.
 * Both must hold before a caller serves fixture data instead of a real
 * query:
 *  - `profileId` is the exact reserved id above, so no real creator can
 *    ever collide with it;
 *  - `isRenderFixtureEnabled()` additionally fails closed on a real
 *    production deployment (`VERCEL_ENV === 'production'`) regardless of
 *    the requested profile id, so this can never serve real traffic even
 *    if the reservation above were ever weakened.
 *
 * Never widen this beyond the exact reserved profile id, and never import
 * it from a non-fixture code path.
 */
export function isScreenCertAppShellFixtureProfile(
  profileId: string | null | undefined
): boolean {
  return (
    profileId === SCREEN_CERT_APP_SHELL_PROFILE_ID && isRenderFixtureEnabled()
  );
}
