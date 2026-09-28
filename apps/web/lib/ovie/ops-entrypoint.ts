import { APP_ROUTES } from '@/constants/routes';

/**
 * Canonical Ops entry for web and the packaged-app M1 owner.
 *
 * One product: the authenticated `/hud` Ops screen. Fullscreen and kiosk are
 * presentation modes of the same `OpsCockpitClient` + metrics contract;
 * browser fullscreen keeps that shell mounted and token kiosk uses the same
 * dashboard data contract.
 * This module is the handoff surface — do not add a desktop shell here.
 */
export const OVIE_OPS_PRODUCT_NAME = 'Ops' as const;

export const OVIE_OPS_COMPONENT = 'OpsCockpitClient' as const;

export const OVIE_OPS_ROUTE = APP_ROUTES.HUD;

export const OVIE_OPS_PRESENTATIONS = {
  shell: {
    search: '',
    density: 'shell',
    presentationMode: 'shell',
  },
  fullscreen: {
    search: '',
    density: 'shell',
    presentationMode: 'shell',
  },
  kiosk: {
    search: 'kiosk=<token>',
    density: 'kiosk',
    presentationMode: 'token',
  },
  mac: {
    search: 'ovie=mac',
    density: 'shell',
    presentationMode: 'shell',
    component: 'HudDashboardClient',
  },
} as const;

export const OVIE_OPS_COMPAT_ALIASES = {
  [APP_ROUTES.OV]: APP_ROUTES.HUD,
  [`${APP_ROUTES.OV}/ops`]: APP_ROUTES.HUD,
  [APP_ROUTES.HUD_TV]: APP_ROUTES.HUD,
} as const;

export const OVIE_PACKAGED_DEFAULT_ROUTE = APP_ROUTES.HUD;
export const OVIE_PACKAGED_TALK_ROUTE = APP_ROUTES.ADMIN_CHAT;

export const OVIE_OPS_ENTRY = {
  productName: OVIE_OPS_PRODUCT_NAME,
  route: OVIE_OPS_ROUTE,
  component: OVIE_OPS_COMPONENT,
  presentations: OVIE_OPS_PRESENTATIONS,
  aliases: OVIE_OPS_COMPAT_ALIASES,
  packagedDefaultRoute: OVIE_PACKAGED_DEFAULT_ROUTE,
  packagedTalkRoute: OVIE_PACKAGED_TALK_ROUTE,
} as const;

export function ovieOpsFullscreenHref(): string {
  // Compatibility helper: fullscreen is now entered on the mounted surface.
  return APP_ROUTES.HUD;
}

export function ovieOpsKioskHref(token: string): string {
  return `${APP_ROUTES.HUD}?kiosk=${encodeURIComponent(token)}`;
}
