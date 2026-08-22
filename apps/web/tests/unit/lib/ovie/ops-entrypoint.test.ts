import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  OVIE_OPS_COMPAT_ALIASES,
  OVIE_OPS_COMPONENT,
  OVIE_OPS_ENTRY,
  OVIE_OPS_PRODUCT_NAME,
  OVIE_OPS_ROUTE,
  OVIE_PACKAGED_DEFAULT_ROUTE,
  OVIE_PACKAGED_TALK_ROUTE,
  ovieOpsFullscreenHref,
  ovieOpsKioskHref,
} from '@/lib/ovie/ops-entrypoint';

describe('Ovie Ops packaged-app entry contract', () => {
  it('hands M1 exactly one Ops product at /hud', () => {
    expect(OVIE_OPS_PRODUCT_NAME).toBe('Ops');
    expect(OVIE_OPS_ROUTE).toBe(APP_ROUTES.HUD);
    expect(OVIE_OPS_COMPONENT).toBe('HudDashboardClient');
    expect(OVIE_PACKAGED_DEFAULT_ROUTE).toBe(APP_ROUTES.HUD);
    expect(OVIE_OPS_ENTRY.packagedDefaultRoute).toBe('/hud');
    expect(OVIE_PACKAGED_TALK_ROUTE).toBe(APP_ROUTES.ADMIN_CHAT);
    expect(OVIE_OPS_ENTRY.packagedTalkRoute).toBe('/app/ov/chat');
  });

  it('keeps fullscreen and kiosk as presentation inputs, not products', () => {
    expect(ovieOpsFullscreenHref()).toBe(`${APP_ROUTES.HUD}?fs=1`);
    expect(ovieOpsKioskHref('token-1')).toBe(
      `${APP_ROUTES.HUD}?kiosk=${encodeURIComponent('token-1')}`
    );
    expect(OVIE_OPS_ENTRY.presentations.fullscreen.density).toBe('kiosk');
    expect(OVIE_OPS_ENTRY.presentations.kiosk.presentationMode).toBe('token');
  });

  it('maps compatibility aliases onto /hud', () => {
    expect(OVIE_OPS_COMPAT_ALIASES[APP_ROUTES.OV]).toBe(APP_ROUTES.HUD);
    expect(OVIE_OPS_COMPAT_ALIASES[`${APP_ROUTES.OV}/ops`]).toBe(
      APP_ROUTES.HUD
    );
    expect(OVIE_OPS_COMPAT_ALIASES[APP_ROUTES.HUD_TV]).toBe(
      `${APP_ROUTES.HUD}?fs=1`
    );
  });
});
