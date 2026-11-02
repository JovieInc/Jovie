export const SYSTEM_B_DESKTOP_TOKENS = {
  /**
   * Noir Ion dark ladder (night-dj-harmony-v1): the shell and card sit on
   * the locked Noir Ion surfaces; the retired Carbon-slate shell and card
   * hexes are refused as product chrome. The splash keeps its own cinematic
   * canvas token below.
   */
  backgroundColor: '#06080d',
  borderSubtle: 'rgba(255,255,255,0.07)',
  primaryBackground: '#f7f8f8',
  primaryForeground: '#06080d',
  radiusPill: '999px',
  radiusShell: '16px',
  shadowPopover:
    '0 0 0 1px rgba(255,255,255,0.12), 0 12px 32px rgba(0,0,0,0.52)',
  surfaceColor: '#0f1420',
  textPrimary: '#f7f8f8',
  textSecondary: '#a0a5af',
  /** splash-b-everywhere-v1: tiny cream mark. Keep in lockstep with web BRAND_MARK_*. */
  markCream: '#F5F4F0',
  splashMarkSizePx: 32,
  /** Locked Mac cinematic corner role; web uses BRAND_MARK_SIZE.chrome. */
  macCornerMarkSizePx: 40,
  macCornerMarkOpacity: 0.35,
  macCinematicCanvas: '#030407',
} as const;
