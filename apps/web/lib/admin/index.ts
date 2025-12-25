/**
 * Admin authorization and role management
 *
 * This module provides secure admin authorization with database-backed
 * role verification, caching, and audit logging.
 */

export { checkIsAdmin, requireAdmin } from './middleware';
export { clearAdminCache, invalidateAdminCache, isAdmin } from './roles';
