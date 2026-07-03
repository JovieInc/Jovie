import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commandExposesRemoteDebugging,
  evaluateDesktopInstalledAppsAudit,
  KNOWN_DESKTOP_BUNDLE_IDS,
} from './desktop-installed-apps-audit.mjs';

test('evaluateDesktopInstalledAppsAudit passes for canonical production only', () => {
  const result = evaluateDesktopInstalledAppsAudit({
    bundles: [
      {
        name: 'Jovie.app',
        path: '/Applications/Jovie.app',
        identifier: 'app.jov.ie',
        version: '26.6.61',
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
      },
      {
        name: 'Jovie 2.app',
        path: '/Applications/Jovie 2.app',
        identifier: 'ie.jov.Jovie',
        version: '42',
      },
      {
        name: 'Jovie Staging.app',
        path: '/Applications/Jovie Staging.app',
        identifier: 'app.jov.ie.staging',
        version: '26.6.61',
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
