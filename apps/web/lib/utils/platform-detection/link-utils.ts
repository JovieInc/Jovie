/**
 * Link utility functions for working with DetectedLink and ManagedLink types.
 */

import type { DetectedLink, ManagedLink } from './types';

/**
 * Type guard to check if a DetectedLink has visibility metadata
 */
export function hasManagedMetadata(link: DetectedLink): link is ManagedLink {
  return 'isVisible' in link || 'id' in link || 'state' in link;
}

/**
 * Get visibility status from a link, defaulting to true
 */
export function getLinkVisibility(link: DetectedLink): boolean {
  if ('isVisible' in link) {
    return (link as ManagedLink).isVisible !== false;
  }
  return true;
}
