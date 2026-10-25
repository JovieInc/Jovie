import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMacReceipt,
  classifySession,
  evalBuildIdentity,
  evalComposer,
  evalInboxLabel,
  evalLaunchReadiness,
  evalOvieNoFalseGreen,
  evalShellClean,
  evalShellNav,
  evalSignInOptions,
  evalSignInSurface,
  evalUpdatePrompt,
  MAC_MISSIONS,
  macCertification,
  macFindingIssue,
  macLiveness,
  normalizeSnapshot,
  weeklyMacDefectMetrics,
} from '../mac-dogfood.mjs';

const el = (role, label, token) => ({
  role,
  label,
  element_token: token ?? `t:${label}`,
});
const state = (title, elements) => ({ window_title: title, elements });
const SHA = 'a'.repeat(40);
const stagingIdentity = {
  channel: 'staging',
  version: '26.10.13-staging.39803044098.1',
  sourceRevision: SHA,
  builtAt: '2026-10-22T15:18:58.663Z',
};

test('normalizeSnapshot drops the system menu bar so host recent files never leak', () => {
  const snap = normalizeSnapshot(
    state('Work | Jovie', [
      el('AXWindow', 'Work | Jovie'),
      el('AXMenuBar', ''),
      el('AXMenuItem', 'jovie-bot.pem'),
    ])
  );
  assert.deepEqual(
    snap.elements.map(e => e.label),
    ['Work | Jovie']
  );
});

test('classifySession tells signed-out from signed-in', () => {
  assert.equal(
    classifySession(
      normalizeSnapshot(state('Jovie', [el('AXHeading', 'Finish Signing In')]))
    ),
    'signed-out'
  );
  assert.equal(
    classifySession(normalizeSnapshot(state('Home', [el('AXLink', 'Inbox')]))),
    'signed-in'
  );
});

test('build identity: valid, wrong channel, and no sourceRevision', () => {
  assert.equal(
    evalBuildIdentity({ identity: stagingIdentity, channel: 'staging' }).status,
    'passed'
  );
  assert.equal(
    evalBuildIdentity({
      identity: { ...stagingIdentity, channel: 'production' },
      channel: 'staging',
    }).status,
    'failed'
  );
  assert.equal(
    evalBuildIdentity({
      identity: { ...stagingIdentity, sourceRevision: null },
      channel: 'staging',
    }).status,
    'failed'
  );
  assert.equal(
    evalBuildIdentity({ identity: null, channel: 'staging' }).status,
    'failed'
  );
});

test('launch readiness is advisory when absent and fails on unverified provenance', () => {
  assert.equal(
    evalLaunchReadiness({ readiness: null, channel: 'staging' }).status,
    'unverified'
  );
  assert.equal(
    evalLaunchReadiness({
      readiness: { nativeBuild: { provenance: 'unverified' } },
      channel: 'staging',
    }).status,
    'failed'
  );
  const ok = evalLaunchReadiness({
    readiness: {
      nativeBuild: { provenance: 'verified' },
      nativeWindowReadyToShowMs: 460.2,
      reactMountedMs: 6739,
      composerVisibleEditableAfterPaintOpportunityMs: 9693,
    },
    channel: 'staging',
  });
  assert.equal(ok.status, 'passed');
  assert.match(ok.summary, /composer 9693ms/);
});

test('sign-in surface and options', () => {
  const surface = normalizeSnapshot(
    state('Jovie', [
      el('AXButton', 'Continue In Browser'),
      el('AXButton', 'Other Sign-in Options'),
    ])
  );
  assert.equal(evalSignInSurface(surface, 'production').status, 'passed');
  const missing = normalizeSnapshot(
    state('Jovie', [el('AXButton', 'Copy Sign-in Link')])
  );
  const r = evalSignInOptions(missing, 'production');
  assert.equal(r.status, 'failed');
  assert.match(r.summary, /Enter A Code, Scan With Phone/);
});

test('shell nav needs the right title and heading for each destination', () => {
  const good = n =>
    normalizeSnapshot(state(`${n} | Jovie`, [el('AXHeading', n)]));
  const visits = {
    Inbox: normalizeSnapshot(state('Home | Jovie', [el('AXHeading', 'Home')])),
    Identity: normalizeSnapshot(
      state('Profiles | Jovie', [el('AXHeading', 'Profiles')])
    ),
    Work: good('Work'),
    Audience: normalizeSnapshot(state('Audience | Jovie', [])),
  };
  const out = evalShellNav(visits, 'staging');
  assert.deepEqual(
    out.map(c => c.status),
    ['passed', 'passed', 'passed', 'failed']
  );
});

test('shell clean flags error copy but not content', () => {
  const visits = {
    Work: normalizeSnapshot(
      state('Work | Jovie', [
        el('AXStaticText', 'Shipping data could not load.'),
      ])
    ),
    Audience: normalizeSnapshot(
      state('Audience | Jovie', [el('AXStaticText', 'Subscriber')])
    ),
  };
  assert.deepEqual(
    evalShellClean(visits, 'staging').map(c => c.status),
    ['failed', 'passed']
  );
});

test('inbox label: "1 Items" is a pluralization defect observed on the canary', () => {
  const bad = normalizeSnapshot(
    state('Home', [
      el('AXLink', 'Inbox — 1 Items Need Attention; App Update Available'),
    ])
  );
  const r = evalInboxLabel(bad, 'staging');
  assert.equal(r.status, 'failed');
  assert.equal(r.severity, 'P3');
  assert.equal(
    evalInboxLabel(
      normalizeSnapshot(
        state('Home', [el('AXLink', 'Inbox — 3 Items Need Attention')])
      ),
      'staging'
    ).status,
    'passed'
  );
  assert.equal(
    evalInboxLabel(
      normalizeSnapshot(
        state('Home', [el('AXLink', 'Inbox — 1 Item Needs Attention')])
      ),
      'staging'
    ).status,
    'passed'
  );
});

test('composer must be a labeled text area', () => {
  assert.equal(
    evalComposer(
      normalizeSnapshot(
        state('New Chat', [el('AXTextArea', 'Chat Message Input')])
      ),
      'staging'
    ).status,
    'passed'
  );
  assert.equal(
    evalComposer(normalizeSnapshot(state('New Chat', [])), 'staging').status,
    'failed'
  );
});

test('Ovie all-clear with failed sections is a false green (observed 2026-10-25)', () => {
  const observed = normalizeSnapshot(
    state('Home | Jovie', [
      el('AXStaticText', 'Prod'),
      el('AXStaticText', 'Queue'),
      el('AXStaticText', 'Nothing is blocking shipping'),
      ...Array.from({ length: 8 }, () => el('AXStaticText', 'Not measured')),
      el('AXStaticText', 'Shipping data could not load.'),
      el('AXStaticText', 'Shipping data could not load.'),
    ])
  );
  const r = evalOvieNoFalseGreen(observed, 'staging');
  assert.equal(r.status, 'failed');
  assert.match(r.actual, /2 "could not load"/);
  const healthy = normalizeSnapshot(
    state('Home | Jovie', [
      el('AXStaticText', 'Prod'),
      el('AXStaticText', 'Queue'),
      el('AXStaticText', 'Nothing is blocking shipping'),
      el('AXStaticText', '12m'),
    ])
  );
  assert.equal(evalOvieNoFalseGreen(healthy, 'staging').status, 'passed');
  const loading = normalizeSnapshot(
    state('Home | Jovie', [el('AXHeading', 'Ov')])
  );
  assert.equal(evalOvieNoFalseGreen(loading, 'staging').status, 'unverified');
  const unknown = normalizeSnapshot(
    state('Home', [
      el('AXStaticText', 'Prod'),
      el('AXStaticText', 'Queue'),
      el('AXStaticText', 'Shipping data is disconnected'),
    ])
  );
  assert.equal(evalOvieNoFalseGreen(unknown, 'staging').status, 'passed');
});

test('update prompt: coherent states pass, half states fail', () => {
  const avail = normalizeSnapshot(
    state('New Chat', [
      el('AXHeading', 'Jovie 26.10.17-staging.40100497014.1 Is Available'),
      el('AXButton', 'Later'),
      el('AXButton', 'Download'),
    ])
  );
  assert.equal(
    evalUpdatePrompt(avail, 'staging', stagingIdentity.version).status,
    'passed'
  );
  const noButtons = normalizeSnapshot(
    state('New Chat', [
      el('AXHeading', 'Jovie 26.10.17-staging.40100497014.1 Is Available'),
    ])
  );
  assert.equal(
    evalUpdatePrompt(noButtons, 'staging', stagingIdentity.version).status,
    'failed'
  );
  const same = normalizeSnapshot(
    state('x', [
      el('AXHeading', `Jovie ${stagingIdentity.version} Is Available`),
      el('AXButton', 'Later'),
      el('AXButton', 'Download'),
    ])
  );
  assert.equal(
    evalUpdatePrompt(same, 'staging', stagingIdentity.version).status,
    'failed'
  );
  assert.equal(
    evalUpdatePrompt(normalizeSnapshot(state('x', [])), 'staging', '1').status,
    'passed'
  );
});

test('receipt binds shell sourceRevision and web commit, retains no identity', () => {
  const mission = MAC_MISSIONS.find(m => m.id === 'dogfood:mac-launch');
  const r = buildMacReceipt({
    mission,
    checks: [{ id: 'build-identity', status: 'passed' }],
    channel: 'staging',
    identity: stagingIdentity,
    web: { commitSha: 'b'.repeat(40) },
    sessionKind: 'founder',
    startedAt: '2026-10-25T00:00:00.000Z',
    completedAt: '2026-10-25T00:01:00.000Z',
  });
  assert.equal(r.kind, 'mac_closed_loop');
  assert.equal(r.commitSha, SHA);
  assert.match(
    r.deploymentId,
    /^desktop-26\.10\.13-staging\.39803044098\.1\+web-bbbbbbbbbbbb$/
  );
  assert.equal(r.outcome, 'passed');
  assert.equal(r.privacy.accountIdentityRetained, false);
  const noSha = buildMacReceipt({
    mission,
    checks: [{ id: 'build-identity', status: 'passed' }],
    channel: 'staging',
    identity: { ...stagingIdentity, sourceRevision: null },
    web: null,
    sessionKind: 'founder',
    startedAt: 'a',
    completedAt: 'b',
  });
  assert.equal(noSha.outcome, 'blocked');
});

test('certification: blocked journeys stay visible, stale builds are not certified', () => {
  const mission = MAC_MISSIONS.find(m => m.id === 'dogfood:mac-launch');
  const receipt = buildMacReceipt({
    mission,
    checks: [{ id: 'build-identity', status: 'passed' }],
    channel: 'staging',
    identity: stagingIdentity,
    web: null,
    sessionKind: 'founder',
    startedAt: '2026-10-25T00:00:00.000Z',
    completedAt: '2026-10-25T00:01:00.000Z',
  });
  const current = macCertification({
    channels: {
      staging: {
        receipts: [receipt],
        identity: stagingIdentity,
        latestPublishedVersion: stagingIdentity.version,
      },
    },
    generatedAt: '2026-10-25T00:02:00.000Z',
  });
  const row = id => current.rows.find(r => r.missionId === id);
  assert.equal(row('dogfood:mac-launch').status, 'certified');
  assert.equal(row('dogfood:mac-summer-turn').status, 'uncertified:blocked');
  assert.match(row('dogfood:mac-summer-turn').blocker, /sanctioned/);
  const stale = macCertification({
    channels: {
      staging: {
        receipts: [receipt],
        identity: stagingIdentity,
        latestPublishedVersion: '26.10.17-staging.1.1',
      },
    },
    generatedAt: '2026-10-25T00:02:00.000Z',
  });
  assert.equal(
    stale.rows.find(r => r.missionId === 'dogfood:mac-launch').status,
    'uncertified:stale-build'
  );
});

test('finding issue is deduped by fingerprint and carries both builds', () => {
  const mission = MAC_MISSIONS.find(m => m.id === 'dogfood:mac-ovie-shipping');
  const check = evalOvieNoFalseGreen(
    normalizeSnapshot(
      state('Home', [
        el('AXStaticText', 'Prod'),
        el('AXStaticText', 'Queue'),
        el('AXStaticText', 'Nothing is blocking shipping'),
        el('AXStaticText', 'Shipping data could not load.'),
      ])
    ),
    'staging'
  );
  const a = macFindingIssue({
    check,
    mission,
    observed: [
      {
        channel: 'staging',
        identity: stagingIdentity,
        web: { commitSha: 'c'.repeat(40) },
      },
      { channel: 'production', identity: { version: '26.10.16' }, web: null },
    ],
  });
  const b = macFindingIssue({
    check: { ...check, target: 'desktop:production:ovie-home' },
    mission,
    observed: [{ channel: 'production', identity: null, web: null }],
  });
  assert.equal(a.fingerprint, b.fingerprint);
  assert.match(
    a.title,
    /^\[dogfood-mac-ovie-shipping-ovie-no-false-green-[0-9a-f]{8}\]/
  );
  assert.match(a.description, /staging: desktop 26\.10\.13-staging/);
  assert.match(a.description, /production: desktop 26\.10\.16/);
  assert.match(a.description, /never attached/);
  assert.equal(a.priority, 3);
});

test('metric counts mac-dogfood as agent-found and escaped desktop defects as Tim-found', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  const rows = weeklyMacDefectMetrics(
    [
      { createdAt: '2026-10-24T00:00:00Z', labels: ['mac-dogfood'] },
      {
        createdAt: '2026-10-24T00:00:00Z',
        labels: ['escaped-defect', 'desktop'],
      },
      { createdAt: '2026-10-24T00:00:00Z', labels: ['escaped-defect'] },
    ],
    { now, weeks: 2 }
  );
  const last = rows[rows.length - 1];
  assert.equal(last.agentFound, 1);
  assert.equal(last.timFound, 1);
});

test('liveness: stale or missing receipts are not alive', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  assert.equal(
    macLiveness({ certification: { rows: [] }, now, maxStalenessMinutes: 60 })
      .alive,
    false
  );
  const rows = [{ completedAt: '2026-10-25T11:30:00.000Z' }];
  assert.equal(
    macLiveness({ certification: { rows }, now, maxStalenessMinutes: 60 })
      .alive,
    true
  );
  assert.equal(
    macLiveness({ certification: { rows }, now, maxStalenessMinutes: 10 })
      .alive,
    false
  );
});
