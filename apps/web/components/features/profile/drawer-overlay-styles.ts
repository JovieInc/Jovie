import { PROFILE_Z } from '@/lib/profile/z-index-constants';

/**
 * Shared overlay class for Vaul-based profile drawers.
 * Ensures consistent backdrop opacity, blur, and z-index across
 * PayDrawer, ListenDrawer, and ContactDrawer.
 *
 * Layered at `PROFILE_Z.DRAWER_BACKDROP` (z-40), below drawer content
 * which sits at `PROFILE_Z.DRAWER_CONTENT` (z-50).
 */
export const DRAWER_OVERLAY_CLASS = `fixed inset-0 ${PROFILE_Z.DRAWER_BACKDROP} bg-black/60 backdrop-blur-sm`;
