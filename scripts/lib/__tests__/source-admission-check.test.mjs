import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  githubApi,
  publishSourceAdmission,
} from '../../source-admission-check.mjs';

const head = 'a'.repeat(40),
  group = 'b'.repeat(40);
const event = {
  repository: { full_name: 'JovieInc/Jovie' },
  pull_request: { number: 1, head: { sha: head } },
};
function fixture({
  allowed = true,
  heads = [head, head],
  throws = false,
} = {}) {
  const writes = [];
  let reads = 0;
  return {
    writes,
    args: {
      event,
      env: { GH_TOKEN: 'fixture', GITHUB_RUN_ID: '1' },
      evaluate: async () => {
        if (throws) throw Error('unavailable');
        return { allowed, blockers: allowed ? [] : ['hold'] };
      },
      api: (endpoint, payload) => {
        if (endpoint === 'graphql')
          return {
            data: {
              repository: {
                pullRequest: {
                  headRefOid: heads[reads++],
                  mergeQueueEntry: { headCommit: { oid: group } },
                },
              },
            },
          };
        writes.push([endpoint, payload]);
        return {};
      },
    },
  };
}
test('source eligibility succeeds without Symphony or deployed-production inputs and never overwrites group success', async () => {
  const f = fixture();
  assert.equal((await publishSourceAdmission(f.args)).disposition, 'allowed');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][1].state, 'success');
});
test('new hold invalidates both source and already-running exact native group', async () => {
  const f = fixture({ allowed: false });
  assert.equal((await publishSourceAdmission(f.args)).disposition, 'blocked');
  assert.equal(f.writes.length, 2);
  assert.ok(f.writes.every(([, s]) => s.state === 'failure'));
  assert.ok(f.writes[1][0].endsWith(group));
});
test('unknown policy evidence cannot leave a new success', async () => {
  const f = fixture({ throws: true });
  await publishSourceAdmission(f.args);
  assert.equal(f.writes[0][1].state, 'failure');
});
test('stale event and head moving during evidence collection never certify new source', async () => {
  for (const heads of [[group], [head, group]]) {
    const f = fixture({ heads });
    assert.equal(
      (await publishSourceAdmission(f.args)).disposition,
      'stale-event'
    );
    assert.equal(f.writes.length, 0);
  }
});
test('malformed event refuses all API effects', async () => {
  const f = fixture();
  await assert.rejects(
    publishSourceAdmission({ ...f.args, event: {} }),
    /Invalid/
  );
  assert.equal(f.writes.length, 0);
});

test('trusted review signal reads current PR metadata without executing review artifacts', async () => {
  const f = fixture();
  const event = {
    repository: { full_name: 'JovieInc/Jovie' },
    workflow_run: {
      event: 'pull_request_review',
      pull_requests: [{ number: 1, head: { sha: head } }],
    },
  };
  const result = await publishSourceAdmission({
    ...f.args,
    event,
  });
  assert.equal(result.disposition, 'allowed');
  assert.equal(f.writes.length, 1);
  await assert.rejects(
    publishSourceAdmission({
      ...f.args,
      event: {
        ...event,
        workflow_run: { event: 'pull_request_review', pull_requests: [] },
      },
    }),
    /Ambiguous/
  );
});

test('review bridge initial GraphQL outage invalidates its linked exact head without an unguarded REST read', async () => {
  const f = fixture();
  const api = f.args.api;
  const endpoints = [];
  let evaluated = false;
  await assert.rejects(
    publishSourceAdmission({
      ...f.args,
      event: {
        repository: { full_name: 'JovieInc/Jovie' },
        workflow_run: {
          event: 'pull_request_review',
          pull_requests: [{ number: 1, head: { sha: head } }],
        },
      },
      evaluate: async () => {
        evaluated = true;
        return { allowed: true, blockers: [] };
      },
      api: (endpoint, payload) => {
        endpoints.push(endpoint);
        if (endpoint === 'graphql') throw Error('HTTP 503');
        return api(endpoint, payload);
      },
    }),
    /Source policy metadata unavailable/
  );
  assert.equal(evaluated, false);
  assert.deepEqual(endpoints, [
    'graphql',
    `repos/JovieInc/Jovie/statuses/${head}`,
  ]);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][1].state, 'failure');
  assert.equal(f.writes[0][1].context, 'Fork PR Gate');
});

test('metadata API outage invalidates prior source success instead of leaving green', async () => {
  const f = fixture();
  const api = f.args.api;
  await assert.rejects(
    publishSourceAdmission({
      ...f.args,
      api: (endpoint, payload) => {
        if (endpoint === 'graphql') throw Error('unavailable');
        return api(endpoint, payload);
      },
    }),
    /metadata unavailable/
  );
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][1].state, 'failure');
});

test('real gh adapter sends structured JSON and supports metadata GET', () => {
  const directory = mkdtempSync(join(tmpdir(), 'source-gate-api-'));
  const previous = process.env.PATH;
  try {
    writeFileSync(
      join(directory, 'gh'),
      `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({args:process.argv.slice(2)}));`,
      { mode: 0o700 }
    );
    process.env.PATH = directory;
    assert.deepEqual(githubApi('graphql', { query: 'fixture' }).args, [
      'api',
      'graphql',
      '--input',
      '-',
    ]);
    assert.deepEqual(githubApi('repos/JovieInc/Jovie/pulls/1').args, [
      'api',
      'repos/JovieInc/Jovie/pulls/1',
    ]);
  } finally {
    process.env.PATH = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
test('real CLI rejects malformed event without publishing metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'source-gate-cli-'));
  try {
    const path = join(directory, 'event.json');
    writeFileSync(path, '{}');
    const result = spawnSync(
      process.execPath,
      ['scripts/source-admission-check.mjs'],
      { env: { ...process.env, GITHUB_EVENT_PATH: path }, encoding: 'utf8' }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid exact-head/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
