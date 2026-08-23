/** Packaged Mac Ovie door: production `app.jov.ie` must not load staging. */

export const PRODUCTION_DESKTOP_APP_ID = 'app.jov.ie' as const;
export const STAGING_DESKTOP_APP_ID = 'app.jov.ie.staging' as const;
export const OVIE_OPERATOR_TALK_ROUTE = '/app/ov/chat' as const;
export const OVIE_OPERATOR_OPS_ROUTE = '/hud' as const;
export const OVIE_OPERATOR_OPS_SEARCH = 'ovie=mac' as const;
export const CUSTOMER_JOVIE_ENTRY_ROUTE = '/app/chat' as const;

export const OVIE_PACKAGE_PROOF_CHECKS = [
  'codesign-valid',
  'notarized',
  'staple-valid',
  'bundle-id-app.jov.ie',
  'no-competing-staging-shell',
  'source-sha-match',
  'artifact-digest-match',
] as const;

export type OviePackageProofCheck = (typeof OVIE_PACKAGE_PROOF_CHECKS)[number];

export function packagedDesktopAppId(
  appEnv: 'production' | 'staging' | 'local'
): typeof PRODUCTION_DESKTOP_APP_ID | typeof STAGING_DESKTOP_APP_ID {
  return appEnv === 'staging'
    ? STAGING_DESKTOP_APP_ID
    : PRODUCTION_DESKTOP_APP_ID;
}

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
    opsSearch: OVIE_OPERATOR_OPS_SEARCH,
    customerJovie: CUSTOMER_JOVIE_ENTRY_ROUTE,
  } as const;
}

export function ovieOperatorOpsHref(): string {
  return `${OVIE_OPERATOR_OPS_ROUTE}?${OVIE_OPERATOR_OPS_SEARCH}`;
}

export function evaluateOviePackageProof(input: {
  readonly bundleId: string;
  readonly appEnv: 'production' | 'staging' | 'local';
  readonly appUrl: string;
  readonly signed: boolean;
  readonly notarized: boolean;
  readonly stapled: boolean;
  readonly sourceSha: string;
  readonly artifactSourceSha: string;
  readonly artifactDigest: string;
  readonly expectedDigest: string;
}): {
  readonly ok: boolean;
  readonly failed: readonly OviePackageProofCheck[];
} {
  const failed: OviePackageProofCheck[] = [];
  if (!input.signed) failed.push('codesign-valid');
  if (!input.notarized) failed.push('notarized');
  if (!input.stapled) failed.push('staple-valid');
  if (input.bundleId !== PRODUCTION_DESKTOP_APP_ID) {
    failed.push('bundle-id-app.jov.ie');
  }
  if (
    packagedUsesCompetingStagingShell({
      appId: input.bundleId,
      appEnv: input.appEnv,
      appUrl: input.appUrl,
    })
  ) {
    failed.push('no-competing-staging-shell');
  }
  if (input.sourceSha !== input.artifactSourceSha)
    failed.push('source-sha-match');
  if (input.artifactDigest !== input.expectedDigest) {
    failed.push('artifact-digest-match');
  }
  return { ok: failed.length === 0, failed };
}
