import { APP_ROUTES } from '@/constants/routes';

/**
 * Canonical Ops entry for web and the packaged-app M1 owner.
 *
 * One product: authenticated Ops lives at `/app/ov/ops` inside the shared app
 * shell. Fullscreen hides that shell's chrome without changing routes; the
 * token-authenticated `/hud` URL remains the isolated TV/kiosk presentation.
 */
export const OVIE_OPS_PRODUCT_NAME = 'Ops' as const;

export const OVIE_OPS_COMPONENT = 'HudDashboardClient' as const;

export const OVIE_OPS_ROUTE = APP_ROUTES.ADMIN_OPS;

export const OVIE_OPS_PRESENTATIONS = {
  shell: {
    search: '',
    density: 'shell',
    presentationMode: 'shell',
  },
  fullscreen: {
    search: 'fs=1',
    density: 'kiosk',
    presentationMode: 'shell',
  },
  kiosk: {
    route: APP_ROUTES.HUD,
    search: 'kiosk=<token>',
    density: 'kiosk',
    presentationMode: 'token',
  },
  mac: {
    search: 'ovie=mac',
    density: 'shell',
    presentationMode: 'mac',
    component: 'OvieMacHud',
  },
} as const;

export const OVIE_OPS_COMPAT_ALIASES = {
  [APP_ROUTES.OV]: APP_ROUTES.ADMIN_OPS,
  [APP_ROUTES.HUD]: APP_ROUTES.ADMIN_OPS,
  [APP_ROUTES.HUD_TV]: `${APP_ROUTES.ADMIN_OPS}?fs=1`,
} as const;

export const OVIE_PACKAGED_DEFAULT_ROUTE = APP_ROUTES.ADMIN_OPS;
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
  return `${APP_ROUTES.ADMIN_OPS}?fs=1`;
}

export function ovieOpsKioskHref(token: string): string {
  return `${APP_ROUTES.HUD}?kiosk=${encodeURIComponent(token)}`;
}
