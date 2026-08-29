import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import {
  CUSTOMER_JOVIE_ENTRY_ROUTE,
  evaluateOviePackageProof,
  OVIE_OPERATOR_OPS_ROUTE,
  OVIE_OPERATOR_OPS_SEARCH,
  OVIE_OPERATOR_TALK_ROUTE,
  OVIE_PACKAGE_PROOF_CHECKS,
  ovieOperatorDoorRoutes,
  ovieOperatorOpsHref,
  PRODUCTION_DESKTOP_APP_ID,
  packagedDesktopAppId,
  packagedUsesCompetingStagingShell,
  STAGING_DESKTOP_APP_ID,
} from '../src/ovie-door.ts';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

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
  expect(packagedDesktopAppId('production')).toBe(PRODUCTION_DESKTOP_APP_ID);
  expect(packagedDesktopAppId('staging')).toBe(STAGING_DESKTOP_APP_ID);
});

test('operator talk and ops stay distinct from customer Jovie chat', () => {
  expect(ovieOperatorDoorRoutes()).toEqual({
    talk: OVIE_OPERATOR_TALK_ROUTE,
    ops: OVIE_OPERATOR_OPS_ROUTE,
    opsSearch: OVIE_OPERATOR_OPS_SEARCH,
    customerJovie: CUSTOMER_JOVIE_ENTRY_ROUTE,
  });
  expect(OVIE_OPERATOR_TALK_ROUTE).toBe('/app/ov/chat');
  expect(OVIE_OPERATOR_OPS_ROUTE).toBe('/app/ov/ops');
  expect(ovieOperatorOpsHref()).toBe('/app/ov/ops?ovie=mac');
  expect(CUSTOMER_JOVIE_ENTRY_ROUTE).toBe('/app/chat');
});

test('Ovie Ops stays in the primary BrowserWindow instead of creating an isolated product window', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  const handler = mainSource.match(
    /function openOvieOperatorOpsDoor\(\): void \{[\s\S]*?\n\}/
  )?.[0];

  expect(handler).toBeDefined();
  expect(handler).toMatch(/mainWindow\.loadURL\(OVIE_OPERATOR_OPS_URL\)/);
  expect(handler).toMatch(/showWindow\(mainWindow\)/);
  expect(handler).not.toMatch(
    /new BrowserWindow|publicProfilePreviewWindow|authHandoffWindow/
  );
});

test('package proof requires signature, staple, exact source, and no staging shell', () => {
  const valid = {
    bundleId: PRODUCTION_DESKTOP_APP_ID,
    appEnv: 'production' as const,
    appUrl: 'https://jov.ie',
    signed: true,
    notarized: true,
    stapled: true,
    sourceSha: 'abc',
    artifactSourceSha: 'abc',
    artifactDigest: 'sha256:1',
    expectedDigest: 'sha256:1',
  };
  expect(evaluateOviePackageProof(valid)).toEqual({ ok: true, failed: [] });
  expect(OVIE_PACKAGE_PROOF_CHECKS).toHaveLength(7);
  expect(
    evaluateOviePackageProof({
      ...valid,
      signed: false,
      stapled: false,
      artifactSourceSha: 'other',
      appUrl: 'https://staging.jov.ie',
    }).failed
  ).toEqual([
    'codesign-valid',
    'staple-valid',
    'no-competing-staging-shell',
    'source-sha-match',
  ]);
});

test('packaged main enters the Ovie talk door and starts the Summer bridge', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  expect(mainSource).toMatch(/from '\.\/ovie-door'/);
  expect(mainSource).toMatch(/from '\.\/summer-runtime-bridge'/);
  expect(mainSource).toMatch(/OVIE_OPERATOR_TALK_ROUTE/);
  expect(mainSource).toMatch(/packagedUsesCompetingStagingShell/);
  expect(mainSource).toMatch(/ovieOperatorOpsHref/);
  expect(mainSource).toMatch(/openOvieOperatorTalkDoor/);
  expect(mainSource).toMatch(/openOvieOperatorOpsDoor/);
  expect(mainSource).toMatch(/click: openOvieOperatorOpsDoor/);
  expect(mainSource).toMatch(/click: openOvieOperatorTalkDoor/);
  expect(mainSource).toMatch(/createSummerRuntimeBridge/);
  expect(mainSource).toMatch(/event\.sender\.session\.fetch/);
});

test('every Ovie door has a named same-window escape to customer Jovie', async () => {
  const mainSource = await readFile(join(desktopRoot, 'src/main.ts'), 'utf8');
  expect(mainSource).toMatch(
    /const APP_ENTRY_URL = buildAppUrl\(CUSTOMER_JOVIE_ENTRY_ROUTE\);/
  );
  expect(mainSource).toMatch(
    /label: 'Back to Jovie',\s*click: openCustomerJovieDoor/
  );

  const handler = mainSource.match(
    /function openCustomerJovieDoor\(\): void \{[\s\S]*?\n\}/
  )?.[0];
  expect(handler).toBeDefined();
  expect(handler).toMatch(/createWindow\(APP_ENTRY_URL\)/);
  expect(handler).toMatch(/mainWindow\.loadURL\(APP_ENTRY_URL\)/);
  expect(handler).toMatch(/showWindow\(mainWindow\)/);
  expect(handler).not.toMatch(/about:blank|\.close\(|\.destroy\(|app\.quit\(/);
});
