/**
 * Summer-drives-Jovie control surface (JOV-5217).
 *
 * Same founder/admin gate as OV chat (`isAdmin`). Unauthenticated fails
 * closed at 401. Authenticated non-founder fails at 403.
 */

export type SummerControlAuth = {
  readonly authenticated: boolean;
  readonly isAdmin: boolean;
};

export type SummerControlDecision =
  | { readonly ok: true; readonly status: 200 }
  | { readonly ok: false; readonly status: 401 | 403 };

export function authorizeSummerControl(
  auth: SummerControlAuth
): SummerControlDecision {
  if (!auth.authenticated) {
    return { ok: false, status: 401 };
  }
  if (!auth.isAdmin) {
    return { ok: false, status: 403 };
  }
  return { ok: true, status: 200 };
}

export const SUMMER_CONTROL_PROMOTION = {
  customerFacingRequiresEvalGreen: true,
  lybHealthNeverEntersJovieOrOvieMemory: true,
  promotedWorkflowEveCannotMutate: true,
  codeWorkRoutesSummerSymphonyGem: true,
} as const;
