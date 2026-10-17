/**
 * WebAuthn relying-party id for the passkey plugin. `@better-auth/passkey`
 * only derives it from a *string* `baseURL`; ours is a dynamic
 * `{ allowedHosts, protocol }` object, so it silently fell back to
 * `"localhost"` in production. Browsers' platform authenticators (Touch ID)
 * refuse that RP id on https://jov.ie, which broke the admin passkey unlock.
 *
 * `jov.ie` is a registrable suffix of every Jovie web origin (jov.ie, www,
 * staging, *.jov.ie Ovie), so one id serves all of them. Previews on
 * *.vercel.app cannot use passkeys (fail closed). Local dev uses the
 * page hostname: WebAuthn rejects `localhost` on a `127.0.0.1` origin.
 */
export const PRODUCTION_PASSKEY_RP_ID = 'jov.ie';

function localPasskeyRpId(appUrl: string | undefined): string {
  if (!appUrl) return 'localhost';
  try {
    const hostname = new URL(appUrl).hostname;
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    ) {
      return hostname;
    }
  } catch {
    return 'localhost';
  }
  return 'localhost';
}

export function resolvePasskeyRpId(environment: {
  readonly VERCEL_ENV?: string;
  readonly NEXT_PUBLIC_APP_URL?: string;
}): string {
  if (
    environment.VERCEL_ENV === 'production' ||
    environment.VERCEL_ENV === 'preview'
  ) {
    return PRODUCTION_PASSKEY_RP_ID;
  }
  return localPasskeyRpId(environment.NEXT_PUBLIC_APP_URL);
}
