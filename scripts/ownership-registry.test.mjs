import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkRepository,
  compareLiveFleet,
  IDENTITY_SCHEMA,
  OWNERSHIP_SCHEMA,
  parseMacLanes,
  parseMeshKinds,
  validateRegistries,
} from './ownership-registry.mjs';

const roles = {
  'gem-ci-repair': {
    kind: 'agent',
    name: 'Gem CI repair',
    job: 'Repairs CI',
    identity: 'gem-lanes',
    escalation: ['summer', 'tim'],
  },
  summer: {
    kind: 'agent',
    name: 'Summer',
    job: 'Governor',
    identity: 'summer',
    escalation: ['gem-ci-repair', 'tim'],
  },
  tim: { kind: 'human', name: 'Tim', job: 'Last resort' },
};

const identity = (overrides = {}) => ({
  name: 'Agent',
  kind: 'agent',
  principals: { github: 'bot' },
  credentials: [{ name: 'TOKEN_NAME' }],
  allowedActions: ['act'],
  boundaries: ['bounded'],
  auditTrail: ['ledger'],
  owner: 'summer',
  ...overrides,
});

/**
 * @param {{ assets?: object[], identities?: Record<string, object>, ownerRoles?: Record<string, object> }} [options]
 */
function registries({ assets = [], identities = {}, ownerRoles = roles } = {}) {
  return {
    ownership: { schema: OWNERSHIP_SCHEMA, roles: ownerRoles, assets },
    identities: {
      schema: IDENTITY_SCHEMA,
      identities: {
        summer: identity({ owner: 'gem-ci-repair' }),
        'gem-lanes': identity(),
        ...identities,
      },
    },
  };
}

const workflow = { id: 'workflow:macos-ci', kind: 'workflow' };

test('the committed registries own everything the repository runs', () => {
  const { problems, coverage } = checkRepository();
  assert.deepEqual(problems, []);
  assert.equal(coverage.discoveredUnowned, 0);
  assert.equal(coverage.owned, coverage.registered);
});

test('the Mac lanes have a named agent repair owner (JOV-8657)', async () => {
  const { readFileSync } = await import('node:fs');
  const ownership = JSON.parse(
    readFileSync(new URL('../canon/ownership.json', import.meta.url), 'utf8')
  );
  const macAssets = ownership.assets.filter(asset =>
    [
      'ci-lane:harness:ci-macos',
      'ci-lane:mac:macos',
      'workflow:macos-ci',
      'workflow:mac-lane',
      'workflow:mac-lane-route',
      'runner-pool:jovie-mac',
    ].includes(asset.id)
  );
  assert.equal(macAssets.length, 6);
  for (const asset of macAssets) {
    assert.equal(ownership.roles[asset.owner].kind, 'agent', asset.id);
  }
  assert.match(
    macAssets.find(asset => asset.id === 'ci-lane:harness:ci-macos').repair,
    /JOV-8657/
  );
});

test('a new workflow, lane or service with no entry fails the check', () => {
  const { problems } = validateRegistries({
    ...registries(),
    discovered: [workflow],
  });
  assert.match(problems.join('\n'), /workflow:macos-ci: no owner/);
});

test('humans are never routine owners and only end escalation chains', () => {
  const { problems } = validateRegistries({
    ...registries({
      assets: [
        { ...workflow, owner: 'tim', status: 'active' },
        {
          id: 'repo:x',
          kind: 'repo',
          owner: 'summer',
          escalation: ['tim', 'summer'],
        },
        {
          id: 'repo:y',
          kind: 'repo',
          owner: 'summer',
          escalation: ['gem-ci-repair'],
        },
      ],
    }),
    discovered: [workflow],
  });
  const text = problems.join('\n');
  assert.match(text, /workflow:macos-ci: owner must be an agent role/);
  assert.match(text, /human "tim" may only be the last escalation step/);
  assert.match(text, /repo:y: escalation must end at the human owner/);
});

test('unknown owners, kinds, duplicate ids and undocumented retirements fail', () => {
  const { problems } = validateRegistries({
    ...registries({
      assets: [
        { id: 'repo:a', kind: 'repo', owner: 'nobody' },
        { id: 'repo:a', kind: 'galaxy', owner: 'summer' },
        {
          id: 'service:old',
          kind: 'service',
          owner: 'summer',
          status: 'retired',
        },
        {
          id: 'service:odd',
          kind: 'service',
          owner: 'summer',
          status: 'paused',
        },
      ],
    }),
    discovered: [],
  });
  const text = problems.join('\n');
  assert.match(text, /owner "nobody" is not a registered role/);
  assert.match(text, /duplicate id/);
  assert.match(text, /unknown kind "galaxy"/);
  assert.match(text, /retired assets record when and why/);
  assert.match(text, /status must be active or retired/);
});

test('an active entry whose source is gone must be marked retired', () => {
  const { problems } = validateRegistries({
    ...registries({
      assets: [{ ...workflow, owner: 'gem-ci-repair', status: 'active' }],
    }),
    discovered: [],
  });
  assert.match(problems.join('\n'), /registered active but not found/);
});

test('roles need one human, real identities and complete agent fields', () => {
  const { problems } = validateRegistries({
    ...registries({
      ownerRoles: {
        ghost: {
          kind: 'agent',
          name: 'Ghost',
          job: 'x',
          identity: 'none',
          escalation: [],
        },
        robot: { kind: 'robot' },
      },
    }),
    discovered: [],
  });
  const text = problems.join('\n');
  assert.match(text, /exactly one human owner of last resort/);
  assert.match(text, /role ghost: identity must name an entry/);
  assert.match(text, /role ghost: escalation chain is empty/);
  assert.match(text, /role robot: kind must be agent or human/);
});

test('identities list names only, a real owner, and a tracked fix when shared', () => {
  const { problems } = validateRegistries({
    ...registries({
      identities: {
        leaky: identity({ credentials: [{ name: 'X', value: 'secret' }] }),
        sloppy: identity({ credentials: ['X'], auditTrail: [], owner: 'tim' }),
        borrowed: identity({ sharing: { status: 'borrowed' } }),
        weird: identity({ sharing: { status: 'lent' } }),
        meshy: identity({ mesh: { registered: true } }),
        fine: identity({ sharing: { status: 'shared', fix: 'by-design' } }),
      },
    }),
    discovered: [],
    meshKinds: ['instinct'],
  });
  const text = problems.join('\n');
  assert.match(text, /credential X must not carry a value/);
  assert.match(text, /each credential needs a name/);
  assert.match(text, /sloppy: auditTrail is required/);
  assert.match(text, /sloppy: owner must be an agent role/);
  assert.match(text, /borrowed: a shared or borrowed identity needs a tracked/);
  assert.match(text, /sharing.status must be dedicated, shared or borrowed/);
  assert.match(text, /meshy: a mesh registration names its senderKind/);
  assert.match(text, /mesh kind instinct: no identity/);
  assert.doesNotMatch(text, /identity fine/);
});

test('schema markers are required', () => {
  const { problems } = validateRegistries({
    ownership: { roles: {}, assets: [] },
    identities: {},
    discovered: [],
  });
  assert.match(problems.join('\n'), /schema must be jovie-ownership-registry/);
  assert.match(problems.join('\n'), /schema must be jovie-agent-identity/);
});

test('parsers read the Mac lanes and mesh kinds from source', () => {
  assert.deepEqual(
    parseMacLanes(
      "lane:\n        description: x\n        required: true\n        type: choice\n        options: [ios, 'macos', cli-chaos]\n"
    ),
    ['ios', 'macos', 'cli-chaos']
  );
  assert.deepEqual(parseMacLanes('no lanes'), []);
  assert.deepEqual(
    parseMeshKinds(
      "export const MESH_KINDS = [\n  'grokbot',\n  'instinct',\n] as const;"
    ),
    ['grokbot', 'instinct']
  );
  assert.deepEqual(parseMeshKinds(''), []);
});

test('live drift flags unregistered running agents and registered dead ones', () => {
  const now = new Date('2026-10-20T20:30:00.000Z');
  const identities = {
    identities: {
      claude: identity({ mesh: { registered: true, senderKind: 'claude' } }),
      instinct: identity({
        mesh: { registered: true, senderKind: 'instinct' },
      }),
      gone: identity({ mesh: { registered: true, senderKind: 'gone' } }),
      summer: identity({ mesh: { registered: true, senderKind: 'summer' } }),
      aeon: identity({ mesh: { registered: false, senderKind: 'aeon' } }),
      hermes: identity({ status: 'retired' }),
    },
  };
  const drift = compareLiveFleet({
    identities,
    now,
    liveMesh: [
      { senderKind: 'claude', lastSeenAt: '2026-10-20T20:00:00.000Z' },
      { senderKind: 'instinct', lastSeenAt: null },
      { senderKind: 'aeon', lastSeenAt: '2026-10-20T20:00:00.000Z' },
      { senderKind: 'stranger', lastSeenAt: '2026-10-20T20:00:00.000Z' },
      { senderKind: 'old', lastSeenAt: '2026-10-01T00:00:00.000Z' },
    ],
    automations: [
      { id: 'cron-a', identity: 'claude' },
      { id: 'cron-b', agent: 'mystery' },
      { id: 'cron-c', runsAs: 'hermes' },
      { id: 'cron-d' },
    ],
  });
  const lines = drift.map(item => `${item.kind} ${item.subject}`);
  assert.deepEqual(lines.sort(), [
    'automation-unattributed automation:cron-d',
    'registered-dead mesh:instinct',
    'registry-stale identity:gone',
    'retired-running automation:cron-c',
    'unregistered-running automation:cron-b',
    'unregistered-running mesh:aeon',
    'unregistered-running mesh:old',
    'unregistered-running mesh:stranger',
  ]);
});

test('a stale-but-registered mesh agent is reported dead after 7 days', () => {
  const drift = compareLiveFleet({
    identities: {
      identities: {
        codex: identity({ mesh: { registered: true, senderKind: 'codex' } }),
      },
    },
    now: new Date('2026-10-20T00:00:00.000Z'),
    liveMesh: [{ senderKind: 'codex', lastSeenAt: '2026-10-01T00:00:00.000Z' }],
    automations: null,
  });
  assert.deepEqual(drift, [
    {
      kind: 'registered-dead',
      subject: 'mesh:codex',
      detail: 'last seen 2026-10-01T00:00:00.000Z, over 7 days ago',
    },
  ]);
});

test('the CLI reports coverage and audits a recorded live snapshot', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const script = new URL('./ownership-registry.mjs', import.meta.url).pathname;
  const run = args =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

  const report = run(['--report']);
  assert.equal(report.status, 0, report.stderr);
  assert.match(report.stdout, /workflow\s+owned (\d+)\/\1/);
  assert.match(report.stdout, /discovered assets registered/);
  assert.deepEqual(JSON.parse(run(['--json']).stdout).problems, []);

  const dir = mkdtempSync(path.join(tmpdir(), 'ownership-live-'));
  const meshFile = path.join(dir, 'mesh.json');
  const automationFile = path.join(dir, 'automations.json');
  writeFileSync(
    meshFile,
    JSON.stringify({
      agents: [
        { senderKind: 'claude', lastSeenAt: new Date().toISOString() },
        { senderKind: 'stranger', lastSeenAt: new Date().toISOString() },
      ],
    })
  );
  writeFileSync(
    automationFile,
    JSON.stringify({ automations: [{ id: 'nightly', identity: 'summer' }] })
  );
  const drifted = run([
    '--live',
    '--mesh-file',
    meshFile,
    '--automation-file',
    automationFile,
  ]);
  assert.equal(drifted.status, 1);
  const { drift } = JSON.parse(drifted.stdout);
  assert.ok(
    drift.some(
      item =>
        item.kind === 'unregistered-running' && item.subject === 'mesh:stranger'
    )
  );
  assert.ok(drift.some(item => item.kind === 'registry-stale'));

  writeFileSync(automationFile, JSON.stringify([]));
  assert.equal(
    run([
      '--live',
      '--mesh-file',
      meshFile,
      '--automation-file',
      automationFile,
    ]).status,
    1
  );
});
