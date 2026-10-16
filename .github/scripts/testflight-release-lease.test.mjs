import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  resolveRealGh,
  runWithRealGh,
  storedZip,
} from '../../scripts/lib/real-gh-harness.mjs';
import {
  command,
  comparisonReady,
  evidenceFailureKind,
  evidenceInvocation,
  readEvidence,
  validateLease,
} from './testflight-release-lease.mjs';

const SOURCE = 'a'.repeat(40);
const CONTROLLER_HEAD = 'b'.repeat(40);
const TRANSPORT = 'c'.repeat(40);
const MAIN = 'd'.repeat(40);
const NEXT = 'e'.repeat(40);
const REPOSITORY = 'JovieInc/Jovie';
const NOW = Date.parse('2026-10-16T08:00:00Z');

function fixture() {
  const policy = JSON.parse(
    readFileSync(new URL('../testflight-release-policy.json', import.meta.url))
  );
  const run = {
    id: 80,
    run_attempt: 1,
    workflow_id: 2,
    path: '.github/workflows/ios-testflight.yml',
    event: 'workflow_run',
    head_branch: 'main',
    head_sha: TRANSPORT,
    head_repository: { full_name: REPOSITORY },
    status: 'in_progress',
  };
  const controller = {
    ...run,
    id: 70,
    workflow_id: 1,
    path: '.github/workflows/production-controller.yml',
    head_sha: CONTROLLER_HEAD,
    status: 'completed',
    conclusion: 'success',
    display_title: `Production Controller ${SOURCE} from CI 60 attempt 1`,
  };
  const marker = {
    sha: SOURCE,
    controllerRun: '70',
    controllerAttempt: '1',
    deploymentId: 'dpl_fixture',
  };
  const artifacts = [
    {
      id: 5,
      name: `production-generation-verified-${SOURCE}`,
      expired: false,
      workflow_run: { id: 70, head_sha: CONTROLLER_HEAD },
    },
  ];
  const jobs = [
    {
      id: 9,
      name: 'Production Verified',
      head_sha: CONTROLLER_HEAD,
      status: 'completed',
      conclusion: 'success',
      completed_at: '2026-10-16T07:59:00Z',
    },
  ];
  const intents = [];
  const payloads = new Map([[5, marker]]);
  let main = MAIN;
  const table = new Map([
    [
      'actions/workflows/ios-testflight.yml',
      { id: 2, name: 'iOS TestFlight', path: run.path, state: 'active' },
    ],
    [
      'actions/workflows/production-controller.yml',
      {
        id: 1,
        name: 'Production Controller',
        path: controller.path,
        state: 'active',
      },
    ],
    [
      'actions/workflows/ci.yml',
      { id: 3, name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
    ],
    ['actions/runs/80', run],
    ['actions/runs/80/attempts/1', run],
    ['actions/runs/70', controller],
    ['actions/runs/70/attempts/1', controller],
    [
      'actions/runs/60/attempts/1',
      {
        ...controller,
        id: 60,
        workflow_id: 3,
        path: '.github/workflows/ci.yml',
        event: 'push',
        head_sha: SOURCE,
      },
    ],
  ]);
  table.set('actions/runs/60', table.get('actions/runs/60/attempts/1'));
  const order = [SOURCE, CONTROLLER_HEAD, TRANSPORT, MAIN, NEXT];
  const api = route => {
    const path = route.replace(`repos/${REPOSITORY}/`, '');
    if (path === 'commits/main') return { sha: main };
    if (path === 'actions/artifacts/5') return artifacts[0];
    if (path.startsWith('contents/'))
      return {
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(policy)).toString('base64'),
      };
    if (path.startsWith('compare/')) {
      const [older, newer] = path.slice(8).split('...');
      return {
        status:
          order.indexOf(older) < order.indexOf(newer) ? 'ahead' : 'behind',
        merge_base_commit: { sha: older },
      };
    }
    if (
      path.startsWith(`actions/artifacts?name=production-generation-verified-`)
    )
      return { total_count: artifacts.length, artifacts };
    if (path.startsWith('actions/artifacts?name=testflight-upload-intent'))
      return {
        total_count: intents.filter(a => path.includes(`name=${a.name}&`))
          .length,
        artifacts: intents.filter(a => path.includes(`name=${a.name}&`)),
      };
    if (path === 'actions/runs/70/attempts/1/jobs?per_page=100')
      return { total_count: jobs.length, jobs };
    assert.ok(table.has(path), `Unexpected API request ${path}`);
    return table.get(path);
  };
  const input = {
    repository: REPOSITORY,
    sourceSha: SOURCE,
    transportSha: TRANSPORT,
    workflowRun: '80',
    workflowAttempt: '1',
    controllerRun: '70',
    controllerAttempt: '1',
    now: NOW,
    api,
    readArtifact: id => payloads.get(id),
  };
  const reserve = lease => {
    intents.push({
      id: 6,
      name: `testflight-upload-intent-${lease.baselineSha || 'bootstrap'}`,
      expired: false,
      workflow_run: { id: 80 },
    });
    payloads.set(6, structuredClone(lease));
  };
  return {
    input,
    policy,
    run,
    controller,
    marker,
    artifacts,
    jobs,
    intents,
    payloads,
    table,
    reserve,
    moveMain: sha => {
      main = sha;
    },
  };
}

test('continuous merges preserve one certified source through archive and final upload', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  assert.equal(lease.sourceSha, SOURCE);
  assert.equal(lease.transportSha, TRANSPORT);
  assert.equal(lease.controllerTransportSha, CONTROLLER_HEAD);
  f.reserve(lease);
  for (const phase of ['archive', 'upload']) {
    f.moveMain(NEXT);
    assert.deepEqual(
      validateLease({ ...f.input, previous: lease, phase }),
      lease
    );
  }
});

test('an unfinished compare after main advances is retried and still not a rewind', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  f.moveMain(NEXT);
  const original = f.input.api;
  let unfinished = 2;
  const pauses = [];
  f.input.api = route => {
    if (route.includes('/compare/') && unfinished > 0) {
      unfinished -= 1;
      return { message: 'Sorry, the diff is temporarily unavailable.' };
    }
    return original(route);
  };
  assert.deepEqual(
    validateLease({
      ...f.input,
      previous: lease,
      phase: 'upload',
      pause: attempt => pauses.push(attempt),
    }),
    lease
  );
  assert.deepEqual(pauses, [1, 2]);
  assert.equal(comparisonReady({ status: 'diverged' }), true);
  assert.equal(
    comparisonReady({ message: 'Sorry, the diff is temporarily unavailable.' }),
    false
  );
});

test('a settled diverged compare is still a rewind on the first read', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  const original = f.input.api;
  let compares = 0;
  f.input.api = route => {
    if (route.includes('/compare/')) {
      compares += 1;
      return { status: 'diverged', merge_base_commit: { sha: NEXT } };
    }
    return original(route);
  };
  assert.throws(
    () =>
      validateLease({
        ...f.input,
        previous: lease,
        phase: 'upload',
        pause: () => {
          throw new Error('settled divergence must not be retried');
        },
      }),
    /release lineage rewound or diverged/
  );
  assert.equal(compares, 1);
});

test('an unfinished compare that never settles fails closed without calling it a rewind', () => {
  const f = fixture();
  const original = f.input.api;
  f.input.api = route => {
    if (route.includes('/compare/'))
      return { message: 'diff is unavailable' };
    return original(route);
  };
  assert.throws(
    () =>
      validateLease({
        ...f.input,
        comparisonAttempts: 2,
        pause: () => {},
      }),
    error => {
      assert.match(error.message, /release comparison was not ready/);
      assert.doesNotMatch(error.message, /rewound or diverged/);
      return true;
    }
  );
});

test('compare transport failures are retryable and raw provider output is not classified as success', () => {
  assert.equal(
    evidenceFailureKind(
      'gh: HTTP 404\n',
      '',
      'repos/JovieInc/Jovie/compare/aaa...bbb'
    ),
    'temporarily unavailable'
  );
  assert.equal(
    evidenceFailureKind('gh: HTTP 404\n', '', 'repos/JovieInc/Jovie/commits/main'),
    'failed'
  );
  assert.equal(
    evidenceFailureKind(
      'gh: API rate limit exceeded for installation. (HTTP 403)\n',
      '{"message":"API rate limit exceeded for installation."}',
      'repos/JovieInc/Jovie/compare/aaa...bbb'
    ),
    'rate limited'
  );
  assert.deepEqual(evidenceInvocation(['gh', 'api', 'repos/acme/commits/main']), [
    'bash',
    evidenceInvocation(['gh', 'api', 'x'])[1],
    'api',
    'repos/acme/commits/main',
  ]);
  assert.deepEqual(evidenceInvocation(['git', 'rev-parse', 'HEAD']), [
    'git',
    'rev-parse',
    'HEAD',
  ]);
  let calls = 0;
  const body = readEvidence(
    () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('gh evidence command failed (1); temporarily unavailable');
      }
      return { sha: 'a'.repeat(40) };
    },
    'repos/JovieInc/Jovie/commits/main',
    { pause: () => {}, attempts: 4 }
  );
  assert.equal(body.sha, 'a'.repeat(40));
  assert.equal(calls, 3);
});

test('installation quota exhaustion waits inside the budget and fails closed outside it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tf-hold-'));
  const fake = join(dir, 'gh');
  const state = join(dir, 'hits');
  writeFileSync(
    fake,
    `#!/bin/bash
set -euo pipefail
if [[ "\${1:-}" == "api" && "\${2:-}" == "rate_limit" ]]; then
  printf '%s\\n' "$RESET_EPOCH"
  exit 0
fi
if [[ ! -f "$HOLD_STATE" ]]; then
  : > "$HOLD_STATE"
  printf '%s\\n' 'gh: API rate limit exceeded for installation. (HTTP 403)' >&2
  printf '%s\\n' '{"message":"API rate limit exceeded for installation."}'
  exit 1
fi
printf '%s\\n' '{"ok":true}'
`,
    { mode: 0o755 }
  );
  const envFor = reset => ({
    ...process.env,
    GH_API_HOLD_BIN: fake,
    GH_API_HOLD_BUDGET_SECONDS: '30',
    HOLD_STATE: state,
    RESET_EPOCH: String(reset),
  });
  try {
    const within = command(['gh', 'api', 'repos/JovieInc/Jovie/commits/main'], {
      route: 'repos/JovieInc/Jovie/commits/main',
      env: envFor(Math.floor(Date.now() / 1000) - 5),
    });
    assert.equal(within.trim(), '{"ok":true}');
    rmSync(state, { force: true });
    assert.throws(
      () =>
        command(['gh', 'api', 'repos/JovieInc/Jovie/commits/main'], {
          route: 'repos/JovieInc/Jovie/commits/main',
          env: envFor(Math.floor(Date.now() / 1000) + 10000),
        }),
      error => {
        assert.match(error.message, /; rate limited: /);
        assert.match(error.message, /outside the 30s budget/);
        assert.match(error.message, /Not passing/);
        assert.doesNotMatch(error.message, /rewound or diverged/);
        assert.doesNotMatch(
          error.message,
          /API rate limit exceeded for installation/
        );
        return true;
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('upload does not retry an installation rate limit as an unfinished compare', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  let calls = 0;
  f.input.api = () => {
    calls += 1;
    throw new Error(
      'gh evidence command failed (1); rate limited: GitHub rate limit resets at 9, outside the 600s budget. Not passing.'
    );
  };
  assert.throws(
    () =>
      validateLease({
        ...f.input,
        previous: lease,
        phase: 'upload',
        pause: () => {
          throw new Error('quota exhaustion must not be retried');
        },
      }),
    /outside the 600s budget/
  );
  assert.equal(calls, 1);
});

for (const [label, mutate] of [
  [
    'expired certificate',
    f => {
      f.input.now += 8400 * 1000;
    },
  ],
  [
    'future dated certificate',
    f => {
      f.jobs[0].completed_at = '2026-10-17T00:00:00Z';
    },
  ],
  [
    'explicit source revocation',
    f => {
      f.policy.revokedSources = [SOURCE];
    },
  ],
  [
    'global revocation',
    f => {
      f.policy.blocked = true;
    },
  ],
  [
    'expired production marker',
    f => {
      f.artifacts[0].expired = true;
    },
  ],
  [
    'removed production marker',
    f => {
      f.artifacts.length = 0;
    },
  ],
  [
    'duplicate production marker',
    f => {
      f.artifacts.push({ ...f.artifacts[0], id: 10 });
    },
  ],
  [
    'source/transport marker mismatch',
    f => {
      f.marker.sha = TRANSPORT;
    },
  ],
  [
    'controller source mismatch',
    f => {
      f.controller.display_title = `Production Controller ${TRANSPORT} from CI 60 attempt 1`;
    },
  ],
  [
    'controller head mismatch',
    f => {
      f.artifacts[0].workflow_run.head_sha = SOURCE;
    },
  ],
  [
    'controller rerun',
    f => {
      f.controller.run_attempt = 2;
    },
  ],
  [
    'cancelled controller',
    f => {
      f.controller.conclusion = 'cancelled';
    },
  ],
  [
    'skipped Production Verified',
    f => {
      f.jobs[0].conclusion = 'skipped';
    },
  ],
  [
    'duplicate Production Verified',
    f => {
      f.jobs.push({ ...f.jobs[0], id: 10 });
    },
  ],
  [
    'job source/transport confusion',
    f => {
      f.jobs[0].head_sha = SOURCE;
    },
  ],
  [
    'cancelled TestFlight',
    f => {
      f.run.status = 'completed';
    },
  ],
  [
    'fork TestFlight',
    f => {
      f.run.head_repository.full_name = 'fork/Jovie';
    },
  ],
  [
    'failed source CI',
    f => {
      f.table.get('actions/runs/60/attempts/1').conclusion = 'failure';
    },
  ],
  [
    'non-mainline source CI',
    f => {
      f.table.get('actions/runs/60/attempts/1').head_branch = 'feature';
    },
  ],
  [
    'rewound main',
    f => {
      f.moveMain(SOURCE);
    },
  ],
  [
    'upload rollback',
    f => {
      f.input.baselineSha = NEXT;
    },
  ],
  [
    'already uploaded source',
    f => {
      f.input.baselineSha = SOURCE;
    },
  ],
])
  test(`rejects ${label}`, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => validateLease(f.input));
  });

test('revocation after archive rejects upload without renewing the lease', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  validateLease({ ...f.input, previous: lease, phase: 'archive' });
  f.policy.revision = 'revoked';
  assert.throws(
    () => validateLease({ ...f.input, previous: lease, phase: 'upload' }),
    /lease changed/
  );
});

test('admission main must stay on current main lineage even if source remains an ancestor', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  f.moveMain(TRANSPORT);
  assert.throws(
    () => validateLease({ ...f.input, previous: lease, phase: 'upload' }),
    /rewound/
  );
});

test('rerunning admission cannot duplicate a reserved source', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  assert.throws(() => validateLease(f.input), /intent/);
});

test('upload requires the exact immutable intent', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  assert.throws(
    () => validateLease({ ...f.input, previous: lease, phase: 'upload' }),
    /intent/
  );
  f.reserve(lease);
  f.payloads.get(6).sourceSha = TRANSPORT;
  assert.throws(
    () => validateLease({ ...f.input, previous: lease, phase: 'upload' }),
    /source\/transport/
  );
});

test('expired intent cannot silently permit a duplicate upload', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  f.intents[0].expired = true;
  assert.throws(
    () => validateLease({ ...f.input, previous: lease, phase: 'upload' }),
    /unreadable/
  );
});

test('lease expiry is fixed to certification, including after a long archive', () => {
  const f = fixture();
  const lease = validateLease(f.input);
  f.reserve(lease);
  assert.throws(
    () =>
      validateLease({
        ...f.input,
        previous: lease,
        phase: 'upload',
        now: Date.parse(lease.expiresAt),
      }),
    /expired/
  );
});

test('the latest pending descendant catches up after the active generation reserves its upload', () => {
  const f = fixture();
  const active = validateLease(f.input);
  f.reserve(active);
  // A different workflow run starts only after the active serial lane ends.
  const oldRun = structuredClone(f.run);
  f.table.set('actions/runs/80/attempts/1', oldRun);
  Object.assign(f.run, { id: 81, head_sha: NEXT });
  f.table.set('actions/runs/81', f.run);
  Object.assign(f.controller, {
    id: 71,
    head_sha: NEXT,
    display_title: `Production Controller ${NEXT} from CI 60 attempt 1`,
  });
  f.marker.sha = NEXT;
  f.marker.controllerRun = '71';
  f.artifacts[0].name = `production-generation-verified-${NEXT}`;
  f.artifacts[0].workflow_run = { id: 71, head_sha: NEXT };
  f.jobs[0].head_sha = NEXT;
  f.table.get('actions/runs/60/attempts/1').head_sha = NEXT;
  f.moveMain(NEXT);
  const api = route =>
    f.input.api(route.replace('/actions/runs/71', '/actions/runs/70'));
  const latest = validateLease({
    ...f.input,
    api,
    sourceSha: NEXT,
    transportSha: NEXT,
    controllerRun: '71',
    workflowRun: '81',
    baselineSha: SOURCE,
  });
  assert.equal(latest.sourceSha, NEXT);
  assert.equal(latest.baselineSha, active.sourceSha);
});

for (const attempt of ['another run', 'another attempt'])
  test(`an uncertain upload prevents the same source in ${attempt}`, () => {
    const f = fixture();
    const prior = validateLease(f.input);
    f.reserve(prior);
    f.table.set('actions/runs/80/attempts/1', structuredClone(f.run));
    if (attempt === 'another run') {
      f.run.id = 81;
      f.input.workflowRun = '81';
      f.table.set('actions/runs/81', f.run);
    } else {
      f.run.run_attempt = 2;
      f.input.workflowAttempt = '2';
    }
    assert.throws(() => validateLease(f.input), /duplicate or uncertain/);
  });

test('a successful source watermark retires expired predecessor buckets', () => {
  const f = fixture();
  const prior = validateLease(f.input);
  f.reserve(prior);
  f.intents[0].expired = true;
  // The current certified source is beyond the authenticated uploaded watermark.
  f.input.baselineSha = SOURCE;
  f.input.sourceSha = NEXT;
  f.input.transportSha = NEXT;
  f.run.head_sha = NEXT;
  f.controller.head_sha = NEXT;
  f.controller.display_title = `Production Controller ${NEXT} from CI 60 attempt 1`;
  f.marker.sha = NEXT;
  f.artifacts[0].name = `production-generation-verified-${NEXT}`;
  f.artifacts[0].workflow_run.head_sha = NEXT;
  f.jobs[0].head_sha = NEXT;
  f.table.get('actions/runs/60/attempts/1').head_sha = NEXT;
  f.moveMain(NEXT);
  assert.equal(validateLease(f.input).sourceSha, NEXT);
});

for (const change of [
  'revocation',
  'deadline',
  'rewrite',
  'ordinary main advance',
])
  test(`${change} during evidence collection is checked at the final boundary`, () => {
    const f = fixture();
    let clock = NOW;
    if (change === 'deadline')
      f.jobs[0].completed_at = new Date(NOW - 8400 * 1000 + 1).toISOString();
    const original = f.input.api;
    let changed = false;
    f.input.now = () => clock;
    f.input.api = route => {
      if (!changed && route.includes('name=testflight-upload-intent-')) {
        changed = true;
        if (change === 'revocation') {
          f.policy.blocked = true;
          f.moveMain(NEXT);
        }
        if (change === 'deadline') clock += 2;
        if (change === 'rewrite') f.moveMain(TRANSPORT);
        if (change === 'ordinary main advance') f.moveMain(NEXT);
      }
      return original(route);
    };
    if (change === 'ordinary main advance')
      assert.equal(validateLease(f.input).sourceSha, SOURCE);
    else
      assert.throws(
        () => validateLease(f.input),
        /policy changed|expired during|rewound/
      );
  });

function addReservation(f, { id, source, baseline = '', run = id }) {
  const prior = {
    schema: 'jovie-testflight-release-lease/v1',
    repository: REPOSITORY,
    sourceSha: source,
    transportSha: TRANSPORT,
    baselineSha: baseline,
    intentName: `testflight-upload-intent-${baseline || 'bootstrap'}`,
    workflowRun: String(run),
    workflowAttempt: '1',
  };
  f.intents.push({
    id,
    name: prior.intentName,
    expired: false,
    workflow_run: { id: run },
  });
  f.payloads.set(id, prior);
  f.table.set(`actions/runs/${run}/attempts/1`, {
    ...f.run,
    id: run,
    head_sha: TRANSPORT,
  });
}

test('a late old receipt cannot hide a newer uncertain successor bucket', () => {
  const f = fixture();
  f.input.sourceSha = TRANSPORT;
  f.controller.head_sha = TRANSPORT;
  f.controller.display_title = `Production Controller ${TRANSPORT} from CI 60 attempt 1`;
  f.marker.sha = TRANSPORT;
  f.artifacts[0].name = `production-generation-verified-${TRANSPORT}`;
  f.artifacts[0].workflow_run.head_sha = TRANSPORT;
  f.jobs[0].head_sha = TRANSPORT;
  f.table.get('actions/runs/60/attempts/1').head_sha = TRANSPORT;
  addReservation(f, { id: 10, source: CONTROLLER_HEAD });
  addReservation(f, { id: 11, source: NEXT, baseline: CONTROLLER_HEAD });
  assert.throws(() => validateLease(f.input), /lineage rewound/);
});

test('intent payload must authenticate its exact baseline bucket', () => {
  const f = fixture();
  addReservation(f, { id: 10, source: CONTROLLER_HEAD });
  f.payloads.get(10).baselineSha = MAIN;
  assert.throws(() => validateLease(f.input), /malformed upload intent/);
});

for (const failure of [
  'missing rows',
  'changed count',
  'duplicate id',
  'failed page',
])
  test(`incomplete intent history rejects ${failure}`, () => {
    const f = fixture();
    const original = f.input.api;
    f.input.api = route => {
      if (!route.includes('name=testflight-upload-intent-'))
        return original(route);
      const rows = Array.from({ length: 100 }, (_, i) => ({ id: 100 + i }));
      if (route.includes('&page=2')) {
        if (failure === 'failed page')
          throw new Error('fixture denied page read');
        return {
          total_count: failure === 'changed count' ? 102 : 101,
          artifacts: failure === 'duplicate id' ? [{ id: 100 }] : [{ id: 200 }],
        };
      }
      return {
        total_count: 101,
        artifacts: failure === 'missing rows' ? rows.slice(1) : rows,
      };
    };
    assert.throws(() => validateLease(f.input), /incomplete|ambiguous|denied/);
  });

test('shuffled complete two-page history remains authoritative', () => {
  const f = fixture();
  const original = f.input.api;
  // These prior reservations are strict ancestors of the candidate source.
  f.input.sourceSha = NEXT;
  f.input.transportSha = NEXT;
  f.run.head_sha = NEXT;
  f.controller.head_sha = NEXT;
  f.controller.display_title = `Production Controller ${NEXT} from CI 60 attempt 1`;
  f.marker.sha = NEXT;
  f.artifacts[0].name = `production-generation-verified-${NEXT}`;
  f.artifacts[0].workflow_run.head_sha = NEXT;
  f.jobs[0].head_sha = NEXT;
  f.table.get('actions/runs/60/attempts/1').head_sha = NEXT;
  f.moveMain(NEXT);
  for (let i = 0; i < 101; i++)
    addReservation(f, { id: 100 + i, source: SOURCE });
  f.input.api = route => {
    if (!route.includes('name=testflight-upload-intent-bootstrap'))
      return original(route);
    const rows = [...f.intents].reverse();
    return {
      total_count: rows.length,
      artifacts: route.includes('&page=2')
        ? rows.slice(100)
        : rows.slice(0, 100),
    };
  };
  assert.equal(validateLease(f.input).sourceSha, NEXT);
});

const realGh = resolveRealGh();
if (!realGh && process.env.CI)
  throw new Error(
    'CI must provide real gh for TestFlight lease boundary tests'
  );
test('shipped CLI uses real gh and unzip for admission and the final actual Git checkout boundary', {
  skip: !realGh,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'testflight-cli-'));
  try {
    const gitEnv = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    );
    for (const args of [
      ['init', '-q', root],
      [
        '-C',
        root,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--allow-empty',
        '-qm',
        'fixture',
      ],
    ])
      execFileSync('git', args, { env: gitEnv });
    const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      env: gitEnv,
      encoding: 'utf8',
    }).trim();
    const f = fixture();
    f.jobs[0].completed_at = new Date(Date.now() - 60000).toISOString();
    const remap = value =>
      JSON.parse(
        JSON.stringify(value)
          .replaceAll(SOURCE, head)
          .replaceAll(CONTROLLER_HEAD, head)
          .replaceAll(TRANSPORT, head)
          .replaceAll(MAIN, head)
      );
    const output = join(root, 'output');
    const leasePath = join(root, 'lease.json');
    writeFileSync(output, '');
    const env = {
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_RUN_ID: '80',
      GITHUB_RUN_ATTEMPT: '1',
      RELEASE_SHA: head,
      TESTFLIGHT_TRANSPORT_SHA: head,
      TRIGGER_RUN_ID: '70',
      TRIGGER_RUN_ATTEMPT: '1',
      TESTFLIGHT_LEASE_PATH: leasePath,
      RUNNER_TEMP: root,
      GITHUB_OUTPUT: output,
      NODE_BINARY: process.execPath,
      LEASE_HELPER: new URL('./testflight-release-lease.mjs', import.meta.url)
        .pathname,
      SOURCE_ROOT: root,
    };
    const route = path => {
      const zip = path.match(/actions\/artifacts\/(\d+)\/zip$/);
      if (zip) {
        const name =
          zip[1] === '5'
            ? 'production-generation-verified.json'
            : 'testflight-release-lease.json';
        return {
          body: storedZip({
            [name]: JSON.stringify(remap(f.payloads.get(Number(zip[1])))),
          }),
        };
      }
      try {
        return { body: remap(f.input.api(path)) };
      } catch {
        return null;
      }
    };
    const admit = await runWithRealGh({
      script: 'cd "$SOURCE_ROOT" && "$NODE_BINARY" "$LEASE_HELPER" admit',
      env,
      route,
    });
    assert.equal(admit.code, 0, admit.stderr);
    const lease = JSON.parse(readFileSync(leasePath, 'utf8'));
    assert.equal(lease.sourceSha, head);
    f.reserve(lease);
    const upload = await runWithRealGh({
      script: 'cd "$SOURCE_ROOT" && "$NODE_BINARY" "$LEASE_HELPER" upload',
      env,
      route,
    });
    assert.equal(upload.code, 0, upload.stderr);
    assert.ok(
      upload.requests.some(request =>
        request.includes('actions/artifacts/6/zip')
      )
    );
    f.policy.blocked = true;
    const revoked = await runWithRealGh({
      script: 'cd "$SOURCE_ROOT" && "$NODE_BINARY" "$LEASE_HELPER" upload',
      env,
      route,
    });
    assert.equal(revoked.code, 1);
    assert.match(revoked.stderr, /revoked/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const authority of ['controller', 'CI', 'workflow', 'artifact'])
  test(`${authority} revocation during collection rejects final upload validation`, () => {
    const f = fixture();
    const original = f.input.api;
    let changed = false;
    f.input.api = route => {
      if (!changed && route.includes('name=testflight-upload-intent-')) {
        changed = true;
        if (authority === 'controller') f.controller.run_attempt = 2;
        if (authority === 'CI') f.table.get('actions/runs/60').run_attempt = 2;
        if (authority === 'workflow')
          f.table.get('actions/workflows/ci.yml').state = 'disabled_manually';
        if (authority === 'artifact') f.artifacts[0].expired = true;
      }
      return original(route);
    };
    assert.throws(
      () => validateLease(f.input),
      /changed during|revoked during/
    );
  });
