/**
 * Account security score (JOV-6600). Pure module — safe to import from
 * client components and tests.
 */

export interface SecurityScoreInput {
  emailVerified: boolean;
  hasPassword: boolean;
  passkeyCount: number;
}

export interface SecurityScoreFactor {
  id: 'verified_email' | 'password' | 'passkey';
  label: string;
  active: boolean;
}

const FACTOR_WEIGHTS: Record<SecurityScoreFactor['id'], number> = {
  verified_email: 30,
  password: 30,
  passkey: 40,
};

/**
 * Weighted security posture for the account card. Passkeys carry the
 * most weight because they are phishing-resistant; a verified email is
 * required for recovery and sign-in alerts.
 */
export function computeSecurityScore(input: SecurityScoreInput): {
  score: number;
  factors: SecurityScoreFactor[];
} {
  const factors: SecurityScoreFactor[] = [
    {
      id: 'verified_email',
      label: 'Verified recovery email',
      active: input.emailVerified,
    },
    { id: 'password', label: 'Password set', active: input.hasPassword },
    {
      id: 'passkey',
      label: 'Passkey added',
      active: input.passkeyCount > 0,
    },
  ];

  const score = factors.reduce(
    (acc, factor) => acc + (factor.active ? FACTOR_WEIGHTS[factor.id] : 0),
    0
  );

  return { score, factors };
}
