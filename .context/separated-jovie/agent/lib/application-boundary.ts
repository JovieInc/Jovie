import { APPLICATION_IDENTITY } from '../runtime-identity';

type Environment = Readonly<Record<string, string | undefined>>;
/** Catch accidental secret-domain injection; provider-side scopes remain a deployment gate. */
export function assertRuntimeEnvironment(
  environment: Environment = process.env
): void {
  if (
    environment.EVE_IDENTITY &&
    environment.EVE_IDENTITY !== APPLICATION_IDENTITY
  )
    throw new Error('cross-domain runtime identity denied');
  const forbidden =
    APPLICATION_IDENTITY === 'summer'
      ? /^(DATABASE_URL|NEON_.*|CLERK_SECRET_KEY|BETTER_AUTH_SECRET|EVE_CORE_CHAT_AUTH_TOKEN|JOVIE_.*TOKEN|BLOB_READ_WRITE_TOKEN)$/u
      : /^(SUMMER_.*|GBRAIN_.*|OVIE_TELEGRAM_.*|OVIE_IMESSAGE_ALLOWED_SENDERS)$/u;
  if (
    Object.entries(environment).some(
      ([name, value]) => value && forbidden.test(name)
    )
  )
    throw new Error('cross-domain runtime credential denied');
}

/** Never fall back to an ambient product Blob credential. */
export function summerStoreToken(
  environment: Environment = process.env
): string {
  assertRuntimeEnvironment(environment);
  if (APPLICATION_IDENTITY !== 'summer')
    throw new Error('company storage denied');
  const token = environment.SUMMER_BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) throw new Error('summer-store-unavailable');
  return token;
}
