/**
 * Entity → href resolver for the cmd+k surface.
 *
 * Chat-slash inserts entities as chips; cmd+k navigates to them. Each entity
 * kind has either a canonical detail surface or none yet — when none, we
 * return null so the palette can decline to commit (or fall back to chat).
 *
 * Releases don't have a top-level detail page today; the closest canonical
 * surface is the per-release tasks workspace, so we route there. Artists
 * and tracks have no per-id detail pages at all yet — those surfaces ship
 * later. Returning null for those kinds keeps cmd+k honest instead of
 * silently dropping the user on an unrelated screen.
 */

import { APP_ROUTES } from '@/constants/routes';
import type { EntityRef } from '@/lib/commands/entities';

export function resolveEntityHref(entity: EntityRef): string | null {
  if (entity.kind === 'release') {
    return `${APP_ROUTES.DASHBOARD_RELEASES}/${entity.id}/tasks`;
  }
  // Artists and tracks don't have per-entity detail pages yet.
  return null;
}
