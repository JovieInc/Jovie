import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'node:test';
import {
  credentialState,
  emptyLedger,
} from '../../packages/api-client/policy.ts';
import {
  BASE,
  fixture,
  read,
  write,
} from './fixtures/mutation-next-cli-fixture.mjs';

it('selects, authenticates, begins and finishes using the real sweep evidence format', () => {
  const f = fixture();
  try {
    const selected = f.run('select');
    assert.equal(selected.status, 0, selected.stderr);
    assert.match(selected.output, /selected=true/u);
    const claim = f.publishClaim();
    assert.equal(f.run('verify-claim').status, 0);
    assert.equal(f.run('begin').status, 0);
    const history = f.score(claim);
    assert.equal(f.run('finish').status, 0);
    const result = read(join(f.stateDir, 'next-target-result.json'));
    assert.equal(result.status, 'measured');
    assert.equal(result.actualModuleSha, f.testedSha);
    const pred = {
      runId: '500',
      runAttempt: '1',
      sha: f.testedSha,
      cacheKey: 'mutation-sweep-portable-v2-500-1',
      artifactName: 'mutation-sweep-500',
    };
    f.publication(pred, f.state, history, result);
    const replay = f.run('select', { GITHUB_RUN_ID: '501' });
    assert.match(replay.output, /selected=false/u);
    assert.doesNotMatch(replay.output, /hold=true/u);
  } finally {
    f.close();
  }
});

it('recovers published fulfillment after cache eviction without claiming again or refreshing a stale score', () => {
  const f = fixture();
  try {
    assert.match(f.run('select').output, /selected=true/u);
    const claim = f.publishClaim();
    assert.equal(f.run('verify-claim').status, 0);
    assert.equal(f.run('begin').status, 0);
    const history = f.score(claim);
    assert.equal(f.run('finish').status, 0);
    const result = read(join(f.stateDir, 'next-target-result.json'));
    const pred = {
      runId: '500',
      runAttempt: '1',
      sha: f.testedSha,
      cacheKey: 'mutation-sweep-portable-v2-500-1',
      artifactName: 'mutation-sweep-500',
    };
    f.publication(pred, f.state, history, result);
    delete f.routes[
      `${BASE}/actions/caches?key=${pred.cacheKey}&ref=refs%2Fheads%2Fmain&per_page=100`
    ];
    const current = structuredClone(f.state);
    Object.assign(current.modules[f.request.file], {
      status: 'stale',
      score: null,
    });
    current.modules[f.request.file].evidence.configDigest = 'd'.repeat(64);
    write(join(f.stateDir, 'sweep-state.json'), current);
    const preserved = new Map(
      [
        'sweep-state.json',
        'sweep-state.json.runs.jsonl',
        'next-target-ledger.json',
        'next-target-result.json',
      ].map(name => [name, readFileSync(join(f.stateDir, name), 'utf8')])
    );
    const oldClaim = readFileSync(
      join(f.runner, 'mutation-next/claim.json'),
      'utf8'
    );
    const priorCalls = readFileSync(f.callsPath, 'utf8')
      .trim()
      .split('\n').length;
    const replay = f.run('select', { GITHUB_RUN_ID: '501' });
    assert.equal(replay.status, 0, replay.stderr);
    assert.match(replay.output, /selected=false/u);
    assert.doesNotMatch(replay.output, /hold=true/u);
    for (const [name, bytes] of preserved)
      assert.equal(readFileSync(join(f.stateDir, name), 'utf8'), bytes);
    assert.equal(
      readFileSync(join(f.runner, 'mutation-next/claim.json'), 'utf8'),
      oldClaim
    );
    const calls = readFileSync(f.callsPath, 'utf8')
      .trim()
      .split('\n')
      .slice(priorCalls)
      .map(line => JSON.parse(line));
    assert.equal(calls.filter(([method]) => method === 'POST').length, 0);
    assert.equal(
      calls.filter(([, path]) => path.includes('/actions/caches')).length,
      0
    );
  } finally {
    f.close();
  }
});

it('still requires a live cache for new admission and current publication', () => {
  for (const mode of ['select', 'published']) {
    const f = fixture();
    try {
      const pred =
        mode === 'select'
          ? f.request.predecessor
          : {
              runId: '500',
              runAttempt: '1',
              sha: f.testedSha,
              cacheKey: 'mutation-sweep-portable-v2-500-1',
              artifactName: 'mutation-sweep-500',
            };
      if (mode === 'published') f.publication(pred, f.state);
      f.routes[
        `${BASE}/actions/caches?key=${pred.cacheKey}&ref=refs%2Fheads%2Fmain&per_page=100`
      ].json = { total_count: 0, actions_caches: [] };
      const held = f.run(mode, {
        ROLLING_ELIGIBLE: 'true',
        NEXT_PENDING: 'false',
      });
      assert.equal(held.status, mode === 'select' ? 0 : 75);
      assert.match(held.output, /hold=true/u);
      assert.doesNotMatch(held.output, /selected=true|wake=true/u);
      assert.equal(
        existsSync(join(f.runner, 'mutation-next/outbox.json')),
        false
      );
      if (mode === 'published') assert.equal(f.run('dispatch').status, 75);
      const calls = readFileSync(f.callsPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.equal(calls.filter(([method]) => method === 'POST').length, 0);
      assert.equal(
        calls.filter(([, path]) => path.includes('/actions/caches')).length,
        1
      );
    } finally {
      f.close();
    }
  }
});

it('does not recover forged or failed historical publication merely because its cache was evicted', () => {
  for (const fault of ['zip-digest', 'save-failure', 'superseded-attempt']) {
    const f = fixture();
    try {
      assert.match(f.run('select').output, /selected=true/u);
      const claim = f.publishClaim();
      assert.equal(f.run('verify-claim').status, 0);
      assert.equal(f.run('begin').status, 0);
      const history = f.score(claim);
      assert.equal(f.run('finish').status, 0);
      const result = read(join(f.stateDir, 'next-target-result.json'));
      const artifact = f.publication(
        {
          runId: '500',
          runAttempt: '1',
          sha: f.testedSha,
          cacheKey: 'mutation-sweep-portable-v2-500-1',
          artifactName: 'mutation-sweep-500',
        },
        f.state,
        history,
        result
      );
      delete f.routes[
        `${BASE}/actions/caches?key=mutation-sweep-portable-v2-500-1&ref=refs%2Fheads%2Fmain&per_page=100`
      ];
      if (fault === 'zip-digest') artifact.digest = `sha256:${'0'.repeat(64)}`;
      else if (fault === 'save-failure')
        f.routes[
          `${BASE}/actions/runs/500/attempts/1/jobs?per_page=100`
        ].json.jobs[0].steps.find(
          step => step.name === 'Save sweep state'
        ).conclusion = 'failure';
      else f.routes[`${BASE}/actions/runs/500`].json.run_attempt = 2;
      const held = f.run('select', { GITHUB_RUN_ID: '501' });
      assert.equal(held.status, 0);
      assert.match(held.output, /hold=true/u);
      assert.doesNotMatch(held.output, /selected=true/u);
      const calls = readFileSync(f.callsPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
      assert.equal(calls.filter(([method]) => method === 'POST').length, 0);
    } finally {
      f.close();
    }
  }
});

it('refuses altered ZIP bytes and truncated publication inventory before claiming', () => {
  for (const fault of ['digest', 'truncated', 'fork']) {
    const f = fixture();
    try {
      if (fault === 'digest')
        f.predecessorArtifact.digest = `sha256:${'0'.repeat(64)}`;
      else if (fault === 'truncated')
        f.routes[`${BASE}/actions/runs/400/artifacts?per_page=100`].json
          .total_count++;
      else
        f.routes[`${BASE}/actions/runs/400`].json.head_repository.full_name =
          'fork/Jovie';
      const result = f.run('select');
      assert.equal(result.status, 0);
      assert.match(result.output, /hold=true/u);
      assert.doesNotMatch(result.output, /selected=true/u);
    } finally {
      f.close();
    }
  }
});

it('requires immutable authentication and unchanged scoring inputs before beginning', () => {
  const f = fixture();
  try {
    assert.match(f.run('select').output, /selected=true/u);
    assert.equal(f.run('begin').status, 75);
    assert.equal(
      existsSync(join(f.stateDir, 'next-target-ledger.json')),
      false
    );
    f.publishClaim();
    assert.equal(f.run('verify-claim').status, 0);
    write(join(f.cwd, '.cache/jovie-mutation-baseline/sweep-state.json'), {
      schemaVersion: 1,
      modules: {},
      sweepSequences: { 'packages/ui': 20 },
    });
    const changed = f.run('begin');
    assert.equal(changed.status, 75);
    assert.match(changed.stdout, /state changed before admission/u);
    assert.equal(
      existsSync(join(f.stateDir, 'next-target-ledger.json')),
      false
    );
  } finally {
    f.close();
  }
});

it('allows only authenticated skipped scoring to retry through the real adapter', () => {
  for (const conclusion of ['skipped', 'success', 'timed_out']) {
    const f = fixture();
    try {
      assert.match(f.run('select').output, /selected=true/u);
      f.publishClaim();
      f.publication(
        {
          runId: '500',
          runAttempt: '1',
          sha: f.testedSha,
          cacheKey: 'mutation-sweep-portable-v2-500-1',
          artifactName: 'mutation-sweep-500',
        },
        f.state
      );
      f.routes[
        `${BASE}/actions/runs/500/attempts/1/jobs?per_page=100`
      ].json.jobs[0].steps[0].conclusion = conclusion;
      const replay = f.run('select', { GITHUB_RUN_ID: '501' });
      if (conclusion === 'skipped') {
        assert.match(replay.output, /selected=true/u);
        assert.doesNotMatch(replay.output, /hold=true/u);
      } else {
        assert.doesNotMatch(replay.output, /selected=true/u);
        assert.match(replay.output, /hold=true/u);
      }
    } finally {
      f.close();
    }
  }
});

it('retains an uncertain POST reservation across attempts without a second dispatch', () => {
  const f = fixture();
  try {
    const pred = {
      runId: '500',
      runAttempt: '1',
      sha: f.testedSha,
      cacheKey: 'mutation-sweep-portable-v2-500-1',
      artifactName: 'mutation-sweep-500',
    };
    f.publication(pred, f.state);
    for (const status of ['in_progress', 'pending', 'queued']) {
      f.routes[
        `${BASE}/actions/workflows/mutation-diff.yml/runs?status=${status}&branch=main&per_page=100`
      ] = {
        json: {
          total_count: status === 'in_progress' ? 1 : 0,
          workflow_runs: status === 'in_progress' ? [{ id: 500, status }] : [],
        },
      };
    }
    f.listing('mutation-next-wake-500', []);
    const env = {
      NEXT_SELECTED: 'false',
      NEXT_PENDING: 'false',
      ROLLING_ELIGIBLE: 'true',
    };
    const published = f.run('published', env);
    assert.equal(published.status, 0, published.stdout);
    assert.match(published.output, /wake=true/u);
    const outbox = read(join(f.runner, 'mutation-next/outbox.json'));
    const reservation = f.artifact(
      'mutation-next-wake-500',
      '500',
      f.testedSha,
      {
        'outbox.json': JSON.stringify(outbox),
      }
    );
    f.listing(reservation.name, [reservation]);
    const endpoint = `${BASE}/actions/workflows/mutation-diff.yml/dispatches`;
    f.routes[endpoint] = { error: 'connection reset' };
    assert.equal(f.run('dispatch').status, 75);
    f.publication(
      {
        ...pred,
        runAttempt: '2',
        cacheKey: 'mutation-sweep-portable-v2-500-2',
      },
      f.state
    );
    const replay = f.run('published', { ...env, GITHUB_RUN_ATTEMPT: '2' });
    assert.equal(replay.status, 0, replay.stdout);
    assert.doesNotMatch(replay.output, /wake=true/u);
    const calls = readFileSync(f.callsPath, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line));
    assert.equal(calls.filter(args => args.includes(endpoint)).length, 1);
  } finally {
    f.close();
  }
});

it('retains the request without network or mutation after its shared job evidence budget is spent', () => {
  const f = fixture();
  try {
    write(join(f.runner, 'mutation-next/api-calls.json'), {
      identity: '500/1',
      used: 60,
    });
    const held = f.run('select');
    assert.match(held.output, /hold=true/u);
    assert.match(held.stdout, /evidence budget exhausted/u);
    assert.equal(existsSync(f.callsPath), false);
    assert.equal(
      existsSync(join(f.stateDir, 'next-target-ledger.json')),
      false
    );
  } finally {
    f.close();
  }
});

it('keeps a known exhausted caller alias blocked instead of opening a token-hash bucket', () => {
  const f = fixture();
  try {
    const ledger = emptyLedger('github');
    const state = credentialState(ledger, 'retained-installation', Date.now());
    state.buckets.core = {
      limit: 5000,
      remaining: 0,
      resetAt: Date.now() + 3600000,
      observedAt: Date.now(),
    };
    write(join(f.cwd, 'api-state/api-ledger/github.json'), ledger);
    const held = f.run('select', {
      JOVIE_GITHUB_CREDENTIAL: 'retained-installation',
    });
    assert.match(held.output, /hold=true/u);
    assert.equal(existsSync(f.callsPath), false);
    const after = read(join(f.cwd, 'api-state/api-ledger/github.json'));
    assert.deepEqual(Object.keys(after.credentials), ['retained-installation']);
    assert.equal(
      after.credentials['retained-installation'].buckets.core.remaining,
      0
    );
  } finally {
    f.close();
  }
});
