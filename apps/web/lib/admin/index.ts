/**
 * Admin authorization and role management
 *
 * Database-backed admin authorization. `isAdmin` reads Postgres on every
 * check so a Redis "yes" cannot grant privileges.
 */

export type {
  ImpersonationToken,
  ImpersonationValidation,
} from './impersonation';
export {
  endImpersonation,
  getEffectiveClerkId,
  getImpersonationState,
  getImpersonationTimeRemaining,
  getRealAdminClerkId,
  IMPERSONATION_COOKIE,
  ImpersonationError,
  isImpersonating,
  isImpersonationEnabled,
  startImpersonation,
} from './impersonation';
export { checkIsAdmin, requireAdmin } from './middleware';
export { clearAdminCache, invalidateAdminCache, isAdmin } from './roles';
