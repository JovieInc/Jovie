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
  if (primaryEmail && primaryPassword) {
    return {
      source: 'primary',
      email: primaryEmail,
      password: primaryPassword,
      verificationCode: environment.E2E_PROD_USER_CODE ?? '',
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
