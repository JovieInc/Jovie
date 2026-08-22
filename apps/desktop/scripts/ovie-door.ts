/**
 * Packaged Mac Ovie operator door (JOV-5212).
 *
 * Production `app.jov.ie` must not load the staging shell. Customer Jovie
 * still enters `/app/chat`. The operator talk door is `/app/ov/chat`.
 */

export const PRODUCTION_DESKTOP_APP_ID = 'app.jov.ie' as const;
export const STAGING_DESKTOP_APP_ID = 'app.jov.ie.staging' as const;
export const OVIE_OPERATOR_TALK_ROUTE = '/app/ov/chat' as const;
export const OVIE_OPERATOR_OPS_ROUTE = '/hud' as const;
export const CUSTOMER_JOVIE_ENTRY_ROUTE = '/app/chat' as const;

export function packagedUsesCompetingStagingShell(input: {
  readonly appId: string;
  readonly appEnv: 'production' | 'staging' | 'local';
  readonly appUrl: string;
}): boolean {
  if (input.appId !== PRODUCTION_DESKTOP_APP_ID) return false;
  if (input.appEnv === 'staging') return true;
  return /staging\.jov\.ie/i.test(input.appUrl);
}

export function ovieOperatorDoorRoutes() {
  return {
    talk: OVIE_OPERATOR_TALK_ROUTE,
    ops: OVIE_OPERATOR_OPS_ROUTE,
    customerJovie: CUSTOMER_JOVIE_ENTRY_ROUTE,
  } as const;
}
