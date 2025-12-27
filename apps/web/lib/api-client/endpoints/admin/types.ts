/**
 * Admin API Endpoint Types
 *
 * TypeScript interfaces for all admin API response and request shapes.
 * These types match the actual API route handlers in /api/admin/*.
 *
 * @see apps/web/app/api/admin/creator-ingest/route.ts
 * @see apps/web/app/api/admin/creator-ingest/rerun/route.ts
 * @see apps/web/app/api/admin/creator-avatar/route.ts
 * @see apps/web/app/api/admin/creator-social-links/route.ts
 * @see apps/web/app/api/admin/roles/route.ts
 * @see apps/web/app/api/admin/overview/route.ts
 */

// =============================================================================
// Creator Ingest Types
// =============================================================================

/**
 * POST /api/admin/creator-ingest request body
 */
export interface IngestCreatorRequest {
  /** Full URL to the profile to ingest (e.g., https://linktr.ee/username or https://laylo.com/username) */
  url: string;
  /** Optional idempotency key to prevent duplicate ingestion on double-click */
  idempotencyKey?: string;
}

/**
 * Profile data returned from ingestion
 */
export interface IngestedProfile {
  id: string;
  username: string;
  usernameNormalized: string;
  /** Token for claiming the profile */
  claimToken: string | null;
}

/**
 * POST /api/admin/creator-ingest success response
 */
export interface IngestCreatorResponse {
  ok: true;
  profile: IngestedProfile;
  /** Number of links extracted */
  links: number;
  /** Warning message if partial failure (e.g., link extraction issues) */
  warning?: string;
}

/**
 * POST /api/admin/creator-ingest partial success response (207)
 * Returned when profile was created/updated but link extraction had issues
 */
export interface IngestCreatorPartialResponse {
  ok: false;
  profile: IngestedProfile;
  links: number;
  warning: string;
}

// =============================================================================
// Creator Ingest Rerun Types
// =============================================================================

/**
 * POST /api/admin/creator-ingest/rerun request body
 */
export interface RerunIngestionRequest {
  profileId: string;
}

/**
 * Profile data returned from rerun
 */
export interface RerunIngestionProfile {
  id: string;
  username: string;
}

/**
 * POST /api/admin/creator-ingest/rerun success response
 */
export interface RerunIngestionResponse {
  ok: true;
  /** ID of the queued ingestion job */
  jobId: string;
  profile: RerunIngestionProfile;
}

// =============================================================================
// Creator Avatar Types
// =============================================================================

/**
 * POST /api/admin/creator-avatar request body
 */
export interface UpdateCreatorAvatarRequest {
  profileId: string;
  avatarUrl: string;
}

/**
 * POST /api/admin/creator-avatar success response
 */
export interface UpdateCreatorAvatarResponse {
  avatarUrl: string;
}

// =============================================================================
// Creator Social Links Types
// =============================================================================

/**
 * GET /api/admin/creator-social-links request query params
 */
export interface GetCreatorSocialLinksParams {
  profileId: string;
}

/**
 * Social link as returned by the admin social-links API
 * Simplified version for admin view
 */
export interface AdminSocialLink {
  id: string;
  /** Display label for the link */
  label: string;
  url: string;
  platform: string;
  platformType: string;
}

/**
 * GET /api/admin/creator-social-links success response
 */
export interface GetCreatorSocialLinksResponse {
  success: true;
  links: AdminSocialLink[];
}

/**
 * GET /api/admin/creator-social-links error response
 */
export interface GetCreatorSocialLinksErrorResponse {
  success: false;
  error: string;
}

// =============================================================================
// Roles Types
// =============================================================================

/**
 * Role type (currently only 'admin' is supported)
 */
export type AdminRole = 'admin';

/**
 * POST /api/admin/roles request body
 */
export interface GrantRoleRequest {
  /** Clerk user ID of the user to grant the role to */
  userId: string;
  role: AdminRole;
}

/**
 * DELETE /api/admin/roles request body
 */
export interface RevokeRoleRequest {
  /** Clerk user ID of the user to revoke the role from */
  userId: string;
  role: AdminRole;
}

/**
 * User data returned from role operations
 */
export interface RoleOperationUser {
  id: string;
  clerkId: string;
  isAdmin: boolean;
}

/**
 * POST /api/admin/roles success response
 */
export interface GrantRoleResponse {
  success: true;
  message: string;
  user: RoleOperationUser;
}

/**
 * DELETE /api/admin/roles success response
 */
export interface RevokeRoleResponse {
  success: true;
  message: string;
  user: RoleOperationUser;
}

// =============================================================================
// Overview Types
// =============================================================================

/**
 * GET /api/admin/overview success response
 */
export interface AdminOverviewResponse {
  /** Monthly Recurring Revenue in USD cents */
  mrrUsd: number;
  /** Total number of waitlist entries */
  waitlistCount: number;
}

// =============================================================================
// Common Error Types
// =============================================================================

/**
 * Common error response structure for admin endpoints
 */
export interface AdminErrorResponse {
  error: string;
  /** Additional error details (varies by endpoint) */
  details?: string | Record<string, unknown>;
}

/**
 * Validation error response with Zod-style details
 */
export interface AdminValidationErrorResponse {
  error: string;
  details: Array<{
    code: string;
    message: string;
    path: (string | number)[];
  }>;
}
