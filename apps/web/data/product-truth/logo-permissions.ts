import { LOGO_ASSET_REGISTRY } from '@/data/design/logoAssets';
import { LOGO_RELATIONSHIPS, type LogoRelationship } from './proof';

/**
 * Brand-logo permission registry (JOV-7795).
 *
 * A third-party logo renders on a Jovie page only when a record here grants
 * it: who granted permission, when, for which pages and audiences, until
 * when, and the evidence (email or contract). Records are never deleted;
 * revoking sets `revokedAt`, so the history stays auditable.
 *
 * Changes land by pull request so marketing pages stay fully static. The
 * Ovie admin view files the change as a work order.
 */

export interface LogoPermissionScope {
  /**
   * Route paths the grant covers: an exact path (`/pricing`), a prefix
   * pattern (`/solutions/*`), or `*` for every public page.
   */
  readonly pages: readonly string[];
  /**
   * Optional audience restriction. When set, a placement must name one of
   * these audiences; a placement without an audience is not covered.
   */
  readonly audiences?: readonly string[];
}

export interface LogoPermission {
  readonly id: string;
  readonly brand: string;
  /** Asset id in `apps/web/data/design/logo-assets.json`. */
  readonly assetId: string;
  readonly relationship: LogoRelationship;
  /** Person and organization that granted permission. */
  readonly grantedBy: string;
  readonly grantedAt: string;
  /** `null` means the grant does not expire. */
  readonly expiresAt: string | null;
  /** Link to the email, contract or written approval. */
  readonly evidenceUrl: string;
  readonly scope: LogoPermissionScope;
  readonly revokedAt?: string;
  readonly revokedReason?: string;
}

/** Where a logo would render. */
export interface LogoPlacement {
  readonly page: string;
  readonly audience?: string;
}

export type LogoPermissionStatus = 'active' | 'pending' | 'expired' | 'revoked';

/**
 * Every grant Jovie holds. Seeded empty: no brand has granted permission
 * yet, including the five label marks in the logo asset registry.
 */
export const LOGO_PERMISSIONS: readonly LogoPermission[] = [];

export type LogoPermissionIssueCode =
  | 'duplicate-id'
  | 'invalid-evidence-url'
  | 'invalid-expiry'
  | 'invalid-granted-at'
  | 'invalid-relationship'
  | 'invalid-revoked-at'
  | 'invalid-scope-page'
  | 'missing-brand'
  | 'missing-granted-by'
  | 'missing-id'
  | 'missing-scope'
  | 'unknown-asset';

export interface LogoPermissionIssue {
  readonly permissionId: string;
  readonly code: LogoPermissionIssueCode;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDate(value: unknown): value is string {
  return hasText(value) && !Number.isNaN(Date.parse(value));
}

function isHttpsUrl(value: unknown): boolean {
  if (!hasText(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const SCOPE_PAGE_PATTERN = /^(\*|\/[a-z0-9\-/[\]]*(\/\*)?)$/;

const KNOWN_ASSET_IDS = new Set(LOGO_ASSET_REGISTRY.map(asset => asset.id));

/** Structural problems with one record; empty means the record is valid. */
export function validateLogoPermission(
  permission: LogoPermission
): readonly LogoPermissionIssueCode[] {
  const issues: LogoPermissionIssueCode[] = [];
  if (!hasText(permission.id)) issues.push('missing-id');
  if (!hasText(permission.brand)) issues.push('missing-brand');
  if (!KNOWN_ASSET_IDS.has(permission.assetId)) issues.push('unknown-asset');
  if (!LOGO_RELATIONSHIPS.includes(permission.relationship)) {
    issues.push('invalid-relationship');
  }
  if (!hasText(permission.grantedBy)) issues.push('missing-granted-by');
  if (!isIsoDate(permission.grantedAt)) issues.push('invalid-granted-at');
  if (
    permission.expiresAt !== null &&
    (!isIsoDate(permission.expiresAt) ||
      (isIsoDate(permission.grantedAt) &&
        Date.parse(permission.expiresAt) <= Date.parse(permission.grantedAt)))
  ) {
    issues.push('invalid-expiry');
  }
  if (!isHttpsUrl(permission.evidenceUrl)) issues.push('invalid-evidence-url');
  if (permission.scope.pages.length === 0) issues.push('missing-scope');
  if (!permission.scope.pages.every(page => SCOPE_PAGE_PATTERN.test(page))) {
    issues.push('invalid-scope-page');
  }
  if (permission.revokedAt !== undefined && !isIsoDate(permission.revokedAt)) {
    issues.push('invalid-revoked-at');
  }
  return issues;
}

/** Issues across the whole registry, including duplicate ids. */
export function validateLogoPermissions(
  permissions: readonly LogoPermission[]
): readonly LogoPermissionIssue[] {
  const seen = new Set<string>();
  const issues: LogoPermissionIssue[] = [];
  for (const permission of permissions) {
    for (const code of validateLogoPermission(permission)) {
      issues.push({ permissionId: permission.id, code });
    }
    if (seen.has(permission.id)) {
      issues.push({ permissionId: permission.id, code: 'duplicate-id' });
    }
    seen.add(permission.id);
  }
  return issues;
}

export function logoPermissionStatus(
  permission: LogoPermission,
  now: Date
): LogoPermissionStatus {
  const at = now.getTime();
  if (
    permission.revokedAt !== undefined &&
    Date.parse(permission.revokedAt) <= at
  ) {
    return 'revoked';
  }
  if (Date.parse(permission.grantedAt) > at) return 'pending';
  if (permission.expiresAt !== null && Date.parse(permission.expiresAt) <= at) {
    return 'expired';
  }
  return 'active';
}

function pageMatches(pattern: string, page: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return page === prefix || page.startsWith(`${prefix}/`);
  }
  return pattern === page;
}

export function logoPermissionCovers(
  permission: LogoPermission,
  placement: LogoPlacement
): boolean {
  const { pages, audiences } = permission.scope;
  if (!pages.some(pattern => pageMatches(pattern, placement.page))) {
    return false;
  }
  if (audiences === undefined) return true;
  return (
    placement.audience !== undefined && audiences.includes(placement.audience)
  );
}

/**
 * Asset ids that may render at this placement right now: valid, active
 * grants whose scope covers the page. Fails closed on invalid records.
 */
export function permittedLogoAssetIds(
  placement: LogoPlacement,
  options: {
    readonly now?: Date;
    readonly permissions?: readonly LogoPermission[];
  } = {}
): readonly string[] {
  const now = options.now ?? new Date();
  const permissions = options.permissions ?? LOGO_PERMISSIONS;
  const ids: string[] = [];
  for (const permission of permissions) {
    if (validateLogoPermission(permission).length > 0) continue;
    if (logoPermissionStatus(permission, now) !== 'active') continue;
    if (!logoPermissionCovers(permission, placement)) continue;
    if (!ids.includes(permission.assetId)) ids.push(permission.assetId);
  }
  return ids;
}
