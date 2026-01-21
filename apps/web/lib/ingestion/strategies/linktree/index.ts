/**
 * Linktree Profile Ingestion Strategy
 *
 * Extracts profile data and links from Linktree profiles.
 * Hardened for server-side use with proper error handling, timeouts, and retries.
 */

// Re-export base error type
export { ExtractionError } from '../base';

// Re-export configuration
export { LINKTREE_CONFIG, SKIP_HOSTS } from './config';

// Re-export extraction function
export { extractLinktree } from './extraction';

// Re-export fetch function
export { fetchLinktreeDocument } from './fetch';

// Re-export paid tier detection
export { detectLinktreePaidTier } from './paid-tier';

// Re-export validation functions
export {
  extractLinktreeHandle,
  isLinktreeUrl,
  isValidHandle,
  normalizeHandle,
  validateLinktreeUrl,
} from './validation';
