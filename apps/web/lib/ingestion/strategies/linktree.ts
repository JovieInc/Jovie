/**
 * Linktree Profile Ingestion Strategy
 *
 * This file re-exports from the linktree/ directory for backwards compatibility.
 * The implementation has been split into focused modules for reduced complexity.
 *
 * @see ./linktree/index.ts for the module structure
 */

export {
  detectLinktreePaidTier,
  ExtractionError,
  extractLinktree,
  extractLinktreeHandle,
  fetchLinktreeDocument,
  isLinktreeUrl,
  isValidHandle,
  LINKTREE_CONFIG,
  normalizeHandle,
  SKIP_HOSTS,
  validateLinktreeUrl,
} from './linktree/index';
