/**
 * Admin authorization and role management
 *
 * This module provides secure admin authorization with database-backed
 * role verification, caching, and audit logging.
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
export type { IngestionJobStatusCounts } from './overview';
export { getIngestionJobStatusCounts } from './overview';
export { clearAdminCache, invalidateAdminCache, isAdmin } from './roles';
