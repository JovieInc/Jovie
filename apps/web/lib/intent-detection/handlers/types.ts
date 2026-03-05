/**
 * CRUD Handler Types
 * Interfaces for deterministic intent handlers.
 */

import type { DetectedIntent } from '../types';

export interface HandlerContext {
  /** Clerk user ID */
  clerkUserId: string;
  /** Profile ID (may be null for free users without a profile) */
  profileId: string | null;
}

export interface CRUDResult {
  success: boolean;
  /** Human-readable response message to stream back to the user */
  message: string;
  /** Optional structured data for the client (e.g., updated profile fields) */
  data?: Record<string, unknown>;
  /** If true, the client should trigger a UI action (e.g., open file picker) */
  clientAction?: string;
}

export interface CRUDHandler {
  handle(intent: DetectedIntent, context: HandlerContext): Promise<CRUDResult>;
}
