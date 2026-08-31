import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  commandExposesRemoteDebugging,
  evaluateDesktopInstalledAppsAudit,
  KNOWN_DESKTOP_BUNDLE_IDS,
  readDesktopBuildIdentity,
} from './desktop-installed-apps-audit.mjs';

const SOURCE_REVISION = 'a'.repeat(40);

function buildIdentity(overrides = {}) {
  return {
    channel: 'production',
    version: '26.6.61',
    sourceRevision: SOURCE_REVISION,
    builtAt: '2026-08-30T12:34:56.789Z',
    ...overrides,
  };
}

test('evaluateDesktopInstalledAppsAudit passes for canonical production only', () => {
  const result = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: buildIdentity(),
        buildIdentityError: null,
      },
    ],
    processes: [
      {
        pid: '100',
        command: '/Applications/Jovie.app/Contents/MacOS/Jovie',
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test('evaluateDesktopInstalledAppsAudit flags legacy and concurrent shells', () => {
  const result = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: buildIdentity(),
        buildIdentityError: null,
      },
      {
        name: 'Jovie 2.app',
        path: '/Applications/Jovie 2.app',
        identifier: 'ie.jov.Jovie',
        version: '42',
        buildIdentity: null,
        buildIdentityError: 'unavailable',
      },
      {
        name: 'Jovie Staging.app',
        path: '/Applications/Jovie Staging.app',
        identifier: 'app.jov.ie.staging',
        version: '26.6.61',
        buildIdentity: buildIdentity({ channel: 'staging' }),
        buildIdentityError: null,
      },
    ],
    processes: [
      {
        pid: '100',
        command: '/Applications/Jovie.app/Contents/MacOS/Jovie',
      },
      {
        pid: '200',
        command:
          '/Applications/Jovie Staging.app/Contents/MacOS/Jovie Staging --remote-debugging-port=9224',
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some(finding =>
      finding.includes('legacy bundle id ie.jov.Jovie')
    )
  );
  assert.ok(
    result.findings.some(finding =>
      finding.includes('2 Jovie desktop processes')
    )
  );
  assert.ok(
    result.findings.some(finding => finding.includes('--remote-debugging-port'))
  );
});

test('evaluateDesktopInstalledAppsAudit fails closed on missing and mismatched identity', () => {
  const missing = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: null,
        buildIdentityError: 'unavailable',
      },
    ],
    processes: [],
  });
  const mismatch = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
        buildIdentity: buildIdentity({
          channel: 'staging',
          version: '26.6.60',
        }),
        buildIdentityError: null,
      },
    ],
    processes: [],
  });
  const incomplete = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie Staging.app',
        path: '/Applications/Jovie Staging.app',
        identifier: 'app.jov.ie.staging',
        version: '26.6.61',
        buildIdentity: buildIdentity({
          channel: 'staging',
          sourceRevision: null,
        }),
        buildIdentityError: null,
      },
    ],
    processes: [],
  });

  assert.equal(missing.ok, false);
  assert.ok(
    missing.findings.some(finding =>
      finding.includes('provenance is not verified')
    )
  );
  assert.equal(mismatch.ok, false);
  assert.ok(
    mismatch.findings.some(finding =>
      finding.includes('does not match build identity')
    )
  );
  assert.ok(
    mismatch.findings.some(finding =>
      finding.includes('does not match build identity channel')
    )
  );
  assert.equal(incomplete.ok, false);
  assert.ok(
    incomplete.findings.some(finding =>
      finding.includes('build identity is incomplete')
    )
  );
});

test('readDesktopBuildIdentity exposes the packaged no-login receipt', () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'jovie-build-identity-'));
  const resources = path.join(tempRoot, 'Contents', 'Resources');
  mkdirSync(resources, { recursive: true });
  writeFileSync(
    path.join(resources, 'build-identity.json'),
    JSON.stringify(buildIdentity()),
    'utf8'
  );

  try {
    assert.deepEqual(readDesktopBuildIdentity(tempRoot), {
      buildIdentity: buildIdentity(),
      buildIdentityError: null,
    });
    writeFileSync(
      path.join(resources, 'build-identity.json'),
      JSON.stringify({ ...buildIdentity(), secret: 'must-not-surface' }),
      'utf8'
    );
    assert.deepEqual(readDesktopBuildIdentity(tempRoot), {
      buildIdentity: null,
      buildIdentityError: 'invalid',
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('commandExposesRemoteDebugging detects CDP flags', () => {
  assert.equal(
    commandExposesRemoteDebugging(
      '/Applications/Jovie Staging.app/Contents/MacOS/Jovie Staging --remote-debugging-port=9224'
    ),
    true
  );
  assert.equal(
    commandExposesRemoteDebugging(
      '/Applications/Jovie.app/Contents/MacOS/Jovie'
    ),
    false
  );
});

test('KNOWN_DESKTOP_BUNDLE_IDS marks only production as canonical', () => {
  assert.equal(KNOWN_DESKTOP_BUNDLE_IDS['app.jov.ie'].canonical, true);
  assert.equal(KNOWN_DESKTOP_BUNDLE_IDS['app.jov.ie.staging'].canonical, false);
  assert.equal(KNOWN_DESKTOP_BUNDLE_IDS['app.jov.ie.local'].canonical, false);
});
