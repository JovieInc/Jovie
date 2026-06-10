/**
 * Back-compat shim for in-app mark consumers.
 *
 * Canonical source: lib/brand/tokens.ts (JOVIE_PATH + JOVIE_VIEWBOX).
 * New code should import from @/lib/brand directly.
 */
import { JOVIE_PATH, JOVIE_VIEWBOX } from '@/lib/brand/tokens';

export const JOVIE_ICON_PATH = JOVIE_PATH;

export const JOVIE_ICON_VIEW_BOX = `0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}`;
