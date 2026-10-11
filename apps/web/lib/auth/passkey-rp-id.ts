/**
 * WebAuthn relying-party id for the passkey plugin. `@better-auth/passkey`
 * only derives it from a *string* `baseURL`; ours is a dynamic
 * `{ allowedHosts, protocol }` object, so it silently fell back to
 * `"localhost"` in production. Browsers' platform authenticators (Touch ID)
 * refuse that RP id on https://jov.ie, which broke the admin passkey unlock.
 *
 * `jov.ie` is a registrable suffix of every Jovie web origin (jov.ie, www,
 * staging, *.jov.ie Ovie), so one id serves all of them. Previews on
 * *.vercel.app cannot use passkeys (fail closed); local dev uses localhost.
 */
export const PRODUCTION_PASSKEY_RP_ID = 'jov.ie';

export function resolvePasskeyRpId(environment: {
  readonly VERCEL_ENV?: string;
}): string {
  return environment.VERCEL_ENV === 'production' ||
    environment.VERCEL_ENV === 'preview'
    ? PRODUCTION_PASSKEY_RP_ID
    : 'localhost';
}
