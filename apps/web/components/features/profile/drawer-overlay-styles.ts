/**
 * Shared overlay class for Vaul-based profile drawers.
 * Ensures consistent backdrop opacity, blur, and z-index across
 * TipDrawer, ListenDrawer, and ContactDrawer.
 */
export const DRAWER_OVERLAY_CLASS =
  'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm';
