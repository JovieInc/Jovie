import 'server-only';

const ADMIN_MFA_AFTER_MINUTES = 15;

type AuthWithHas = {
  has?: (params: {
    reverification?:
      | 'strict_mfa'
      | 'strict'
      | 'moderate'
      | 'lax'
      | {
          level: 'first_factor' | 'second_factor' | 'multi_factor';
          afterMinutes: number;
        };
  }) => boolean;
};

export function hasRecentAdminMfaReverification(authResult: unknown): boolean {
  const has = (authResult as AuthWithHas | null | undefined)?.has;
  if (typeof has !== 'function') {
    return false;
  }

  return has({
    reverification: {
      level: 'multi_factor',
      afterMinutes: ADMIN_MFA_AFTER_MINUTES,
    },
  });
}
