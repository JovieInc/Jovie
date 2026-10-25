import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprintOf, planFiling } from '../../mac-dogfood-file.mjs';
import {
  macCertification,
  macStatusDoc,
  parseHidIdleSeconds,
  shouldRun,
} from '../mac-dogfood.mjs';

const failing = {
  channel: 'staging',
  mission: 'dogfood:mac-ovie-shipping',
  check: {
    id: 'ovie-no-false-green',
    target: 'desktop:staging:ovie-home',
    status: 'failed',
    severity: 'P2',
    summary:
      'Ovie Home says "Nothing is blocking shipping" while shipping data is unknown',
    expected: 'unknown state',
    actual: 'all-clear shown',
  },
};
const run = {
  staging: {
    identity: {
      version: '26.10.13-staging.1.1',
      sourceRevision: 'a'.repeat(40),
    },
    web: { commitSha: 'b'.repeat(40), environment: 'preview' },
    completedAt: '2026-10-25T02:30:00.000Z',
  },
};

test('planFiling files each failure once and closes only fingerprints proven passing', () => {
  const fixedFp = fingerprintOf({
    channel: 'staging',
    mission: 'dogfood:mac-shell',
    check: { id: 'inbox-label', target: 'desktop:staging:inbox-label' },
  });
  const checks = [
    {
      channel: 'staging',
      mission: 'dogfood:mac-shell',
      check: {
        id: 'inbox-label',
        target: 'desktop:staging:inbox-label',
        status: 'passed',
      },
    },
    failing,
  ];
  const open = [
    {
      identifier: 'JOV-1',
      title: `[${fixedFp}] inbox label reads "1 Items" (Mac staging)`,
    },
    {
      identifier: 'JOV-2',
      title: `[${fingerprintOf(failing)}] still red (Mac staging)`,
    },
    {
      identifier: 'JOV-3',
      title:
        '[dogfood-mac-shell-shell-nav-deadbeef] never ran this time (Mac staging)',
    },
    { identifier: 'JOV-4', title: 'unrelated' },
  ];
  const plan = planFiling({
    findings: [failing],
    checks,
    run,
    openIssues: open,
  });
  assert.equal(plan.toFile.length, 1);
  const both = planFiling({
    findings: [
      failing,
      {
        ...failing,
        channel: 'production',
        check: { ...failing.check, target: 'desktop:production:ovie-home' },
      },
    ],
    checks,
    run,
    openIssues: [],
  });
  assert.equal(both.toFile.length, 1, 'one defect on two lanes is one issue');
  assert.match(both.toFile[0].description, /staging: desktop/);
  assert.match(both.toFile[0].description, /production: desktop/);
  assert.equal(plan.toFile[0].fingerprint, fingerprintOf(failing));
  assert.deepEqual(
    plan.toClose.map(x => x.issue.identifier),
    ['JOV-1']
  );
});

test('shouldRun: first run, changed build, new release, backstop, and the idle gate', () => {
  const base = {
    state: {
      completedAt: '2026-10-25T00:00:00.000Z',
      installed: { staging: { version: '1', sourceRevision: 'x' } },
      latest: { staging: '1' },
    },
    installed: { staging: { version: '1', sourceRevision: 'x' } },
    latest: { staging: '1' },
    now: new Date('2026-10-25T01:00:00.000Z'),
    maxAgeMinutes: 720,
    idleSeconds: 3600,
    requireIdleSeconds: 600,
  };
  assert.equal(shouldRun({ ...base, state: null }).reason, 'first run');
  assert.equal(shouldRun(base).run, false);
  assert.match(
    shouldRun({
      ...base,
      installed: { staging: { version: '2', sourceRevision: 'y' } },
    }).reason,
    /installed staging build changed/
  );
  assert.match(
    shouldRun({ ...base, latest: { staging: '2' } }).reason,
    /new staging release published/
  );
  assert.match(
    shouldRun({ ...base, now: new Date('2026-10-25T13:00:00.000Z') }).reason,
    /backstop/
  );
  const busy = shouldRun({
    ...base,
    latest: { staging: '2' },
    idleSeconds: 30,
  });
  assert.equal(busy.run, false);
  assert.match(busy.reason, /user-active/);
});

test('HIDIdleTime parses from ioreg output and tolerates absence', () => {
  assert.equal(parseHidIdleSeconds('  | "HIDIdleTime" = 125000000000\n'), 125);
  assert.equal(parseHidIdleSeconds('nothing'), null);
});

test('status doc carries counts and versions only', () => {
  const certification = macCertification({
    channels: { staging: { receipts: [], identity: run.staging.identity } },
    generatedAt: '2026-10-25T02:31:00.000Z',
  });
  const doc = macStatusDoc({
    certification,
    run: {
      staging: {
        ...run.staging,
        sessionKind: 'signed-in',
        latestPublishedVersion: '26.10.17-staging.1.1',
      },
    },
    now: new Date('2026-10-25T02:32:00.000Z'),
  });
  assert.equal(doc.schema, 'jovie.mac-dogfood-status/v1');
  assert.equal(doc.at, '2026-10-25T02:32:00.000Z');
  assert.equal(doc.channels.staging.desktopVersion, '26.10.13-staging.1.1');
  assert.deepEqual(Object.keys(doc.channels.staging).sort(), [
    'blocked',
    'certified',
    'completedAt',
    'desktopVersion',
    'failing',
    'latestPublishedVersion',
    'sessionKind',
    'sourceRevision',
    'webCommitSha',
  ]);
});
