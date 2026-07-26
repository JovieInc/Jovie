import { DEFAULT_DEV_TEST_AUTH_EMAILS } from '@/lib/auth/dev-test-auth-identity';

export const PRODUCTION_AUTH_SMOKE_EMAIL =
  DEFAULT_DEV_TEST_AUTH_EMAILS['creator-ready'];

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
