import { DEFAULT_DEV_TEST_AUTH_EMAILS } from '@/lib/auth/dev-test-auth-identity';

export const PRODUCTION_AUTH_SMOKE_EMAIL =
  DEFAULT_DEV_TEST_AUTH_EMAILS['creator-ready'];

/**
 * The seeded browse-admin identity, used by the dogfood agent ONLY as a
 * read-only Ovie observer (users.admin_role = 'read_only', never a full admin).
 * The Ovie admin spec refuses to browse unless a harmless write probe is
 * answered 403, so a missing or revoked role fails loudly instead of leaving
 * CI holding an admin session.
 */
export const PRODUCTION_ADMIN_OBSERVER_EMAIL =
  DEFAULT_DEV_TEST_AUTH_EMAILS.admin;

export function resolveProductionAdminObserverCredentials(
  environment: Readonly<Partial<Record<'DATABASE_URL', string>>> = process.env
): ProductionAuthCredentials | null {
  if (!(environment.DATABASE_URL ?? '').trim()) return null;
  return {
    source: 'primary',
    email: PRODUCTION_ADMIN_OBSERVER_EMAIL,
    password: '',
    verificationCode: '',
  };
}

export interface ProductionAuthCredentials {
  readonly source: 'primary' | 'legacy';
  readonly email: string;
  readonly password: string;
  readonly verificationCode: string;
}

type ProductionAuthEnvironment = Readonly<
  Partial<
    Record<
      | 'E2E_PROD_USER_EMAIL'
      | 'E2E_PROD_USER_PASSWORD'
      | 'E2E_PROD_USER_CODE'
      | 'DATABASE_URL'
      | 'E2E_CLERK_USER_USERNAME'
      | 'E2E_CLERK_USER_PASSWORD',
      string
    >
  >
>;

export function resolveProductionAuthCredentials(
  environment: ProductionAuthEnvironment = process.env
): ProductionAuthCredentials | null {
  const primaryEmail = environment.E2E_PROD_USER_EMAIL ?? '';
  const primaryPassword = environment.E2E_PROD_USER_PASSWORD ?? '';
  const primaryCode = environment.E2E_PROD_USER_CODE ?? '';
  const databaseUrl = environment.DATABASE_URL ?? '';
  if (
    primaryEmail.trim().toLowerCase() === PRODUCTION_AUTH_SMOKE_EMAIL &&
    (primaryCode || databaseUrl)
  ) {
    return {
      source: 'primary',
      email: primaryEmail,
      password: primaryPassword,
      verificationCode: primaryCode,
    };
  }

  const legacyEmail = environment.E2E_CLERK_USER_USERNAME ?? '';
  const legacyPassword = environment.E2E_CLERK_USER_PASSWORD ?? '';
  if (legacyEmail && legacyPassword) {
    return {
      source: 'legacy',
      email: legacyEmail,
      password: legacyPassword,
      verificationCode: '',
    };
  }

  return null;
}
