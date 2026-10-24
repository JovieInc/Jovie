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

describe('Ovie entry contract (founder decision 2026-10-20)', () => {
  it('opens both packaged doors on Ovie Home and keeps one Ops dashboard', () => {
    expect(OVIE_PACKAGED_DEFAULT_ROUTE).toBe(APP_ROUTES.OV);
    expect(OVIE_PACKAGED_TALK_ROUTE).toBe(APP_ROUTES.OV);
    expect(OVIE_OPS_ENTRY.packagedDefaultRoute).toBe('/app/ov');
    expect(OVIE_OPS_ENTRY.packagedTalkRoute).toBe('/app/ov');
    expect(OVIE_OPS_PRODUCT_NAME).toBe('Ops');
    expect(OVIE_OPS_ROUTE).toBe(APP_ROUTES.ADMIN_OPS);
    expect(OVIE_OPS_ROUTE).toBe('/app/ov/ops');
    expect(OVIE_OPS_COMPONENT).toBe('OpsCockpitClient');
  });

  it('keeps fullscreen and kiosk as presentation inputs, not products', () => {
    expect(ovieOpsFullscreenHref()).toBe(APP_ROUTES.ADMIN_OPS);
    expect(ovieOpsKioskHref('token-1')).toBe(
      `${APP_ROUTES.HUD}?kiosk=${encodeURIComponent('token-1')}`
    );
    expect(OVIE_OPS_ENTRY.presentations.fullscreen.density).toBe('shell');
    expect(OVIE_OPS_ENTRY.presentations.kiosk.presentationMode).toBe('token');
    expect(OVIE_OPS_ENTRY.presentations.mac.search).toBe('ovie=mac');
  });

  it('maps the legacy /hud door onto Home', () => {
    expect(OVIE_OPS_COMPAT_ALIASES[APP_ROUTES.HUD]).toBe(APP_ROUTES.OV);
    expect(OVIE_OPS_COMPAT_ALIASES[APP_ROUTES.HUD_TV]).toBe(APP_ROUTES.HUD);
  });
});
