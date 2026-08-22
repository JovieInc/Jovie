import { expect, test } from 'vitest';
import {
  CUSTOMER_JOVIE_ENTRY_ROUTE,
  OVIE_OPERATOR_OPS_ROUTE,
  OVIE_OPERATOR_TALK_ROUTE,
  ovieOperatorDoorRoutes,
  PRODUCTION_DESKTOP_APP_ID,
  packagedUsesCompetingStagingShell,
  STAGING_DESKTOP_APP_ID,
} from './ovie-door.ts';

test('production packaged Mac keeps staging out of the Ovie door', () => {
  expect(
    packagedUsesCompetingStagingShell({
      appId: PRODUCTION_DESKTOP_APP_ID,
      appEnv: 'production',
      appUrl: 'https://jov.ie',
    })
  ).toBe(false);
  expect(
    packagedUsesCompetingStagingShell({
      appId: PRODUCTION_DESKTOP_APP_ID,
      appEnv: 'staging',
      appUrl: 'https://jov.ie',
    })
  ).toBe(true);
  expect(
    packagedUsesCompetingStagingShell({
      appId: PRODUCTION_DESKTOP_APP_ID,
      appEnv: 'production',
      appUrl: 'https://staging.jov.ie',
    })
  ).toBe(true);
  expect(
    packagedUsesCompetingStagingShell({
      appId: STAGING_DESKTOP_APP_ID,
      appEnv: 'staging',
      appUrl: 'https://staging.jov.ie',
    })
  ).toBe(false);
});

test('operator talk and ops stay distinct from customer Jovie chat', () => {
  expect(ovieOperatorDoorRoutes()).toEqual({
    talk: OVIE_OPERATOR_TALK_ROUTE,
    ops: OVIE_OPERATOR_OPS_ROUTE,
    customerJovie: CUSTOMER_JOVIE_ENTRY_ROUTE,
  });
  expect(OVIE_OPERATOR_TALK_ROUTE).toBe('/app/ov/chat');
  expect(OVIE_OPERATOR_OPS_ROUTE).toBe('/hud');
  expect(CUSTOMER_JOVIE_ENTRY_ROUTE).toBe('/app/chat');
});
