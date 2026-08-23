import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_REGISTRY } from '@/constants/admin-navigation';
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

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIRECTORY, '../../../../../..');

describe('Ovie Ops packaged-app entry contract', () => {
  it('keeps Jovie chat as the singular packaged default across source and canon', () => {
    const desktopMain = readFileSync(
      join(REPOSITORY_ROOT, 'apps/desktop/src/main.ts'),
      'utf8'
    );
    const ovieCanon = readFileSync(
      join(REPOSITORY_ROOT, 'docs/OVIE.md'),
      'utf8'
    );

    expect(OVIE_OPS_PRODUCT_NAME).toBe('Ops');
    expect(OVIE_OPS_ROUTE).toBe(APP_ROUTES.HUD);
    expect(OVIE_OPS_COMPONENT).toBe('HudDashboardClient');
    expect(OVIE_PACKAGED_DEFAULT_ROUTE).toBe(APP_ROUTES.CHAT);
    expect(OVIE_OPS_ENTRY.packagedDefaultRoute).toBe('/app/chat');
    expect(OVIE_PACKAGED_TALK_ROUTE).toBe(APP_ROUTES.ADMIN_CHAT);
    expect(OVIE_OPS_ENTRY.packagedTalkRoute).toBe('/app/ov/chat');
    expect(desktopMain).toContain(
      "const APP_ENTRY_URL = buildAppUrl('/app/chat');"
    );
    expect(ovieCanon).toContain('| Packaged default | `/app/chat`');
    expect(ovieCanon).not.toContain('Default installed entry is `/hud`');
    expect(ovieCanon).not.toContain('no `/app/chat` fallback');
  });

  it('keeps Ops secondary and reachable from canonical admin navigation', () => {
    const opsNavigation = ADMIN_NAV_REGISTRY.find(item => item.id === 'ops');

    expect(opsNavigation?.href).toBe(APP_ROUTES.HUD);
    expect(OVIE_OPS_ROUTE).toBe(APP_ROUTES.HUD);
    expect(OVIE_OPS_ENTRY.packagedDefaultRoute).not.toBe(OVIE_OPS_ROUTE);
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
