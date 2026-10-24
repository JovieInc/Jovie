import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  classifyDeployment,
  deploymentTiming,
  queueVerdict,
  renderReport,
  runCli,
  summarizeTeamQueue,
} from './vercel-build-queue.mjs';

const now = Date.parse('2026-10-20T18:03:00Z');
const minutesAgo = m => now - m * 60_000;
const lyBackup = (i, state = 'QUEUED') => ({
  uid: `dpl_lyb${i}`,
  name: 'log-your-body',
  state,
  created: minutesAgo(60 + i),
  buildingAt: state === 'BUILDING' ? minutesAgo(74) : undefined,
  meta: { githubCommitRef: `backup/gem/20261014T0${i}-LYB` },
});
// The 2026-10-20 incident: Jovie staging (prebuilt, CLI, preview target)
// queued 32 min behind log-your-body backup/** previews in a one-slot team.
const staging = {
  id: 'dpl_GWMVx8DzZ527zZ8oHqoDmWqoR887',
  name: 'jovie',
  target: null,
  readyState: 'QUEUED',
  createdAt: minutesAgo(32),
  meta: {},
};

describe('vercel build queue measurement', () => {
  it('classifies production-path, backup, bot and human branches', () => {
    assert.equal(
      classifyDeployment({ name: 'jovie', target: 'production' }),
      'jovie/production'
    );
    assert.equal(classifyDeployment(staging), 'jovie/cli-preview');
    assert.equal(classifyDeployment(lyBackup(1)), 'log-your-body/backup');
    for (const ref of ['codex/jov-1', 'grok-fix', 'devin/x', 'gem/y']) {
      assert.equal(
        classifyDeployment({
          name: 'log-your-body',
          meta: { githubCommitRef: ref },
        }),
        'log-your-body/bot-branch'
      );
    }
    assert.equal(
      classifyDeployment({
        name: 'jovie-docs',
        meta: { githubCommitRef: 'main' },
      }),
      'jovie-docs/main'
    );
    assert.equal(
      classifyDeployment({ meta: { githubCommitRef: 'tim/feature' } }),
      'unknown/branch'
    );
  });

  it('measures queue wait while queued and build time once ready', () => {
    assert.deepEqual(deploymentTiming(staging, now), {
      state: 'QUEUED',
      queueSeconds: 1920,
      buildSeconds: null,
    });
    assert.deepEqual(
      deploymentTiming(
        {
          readyState: 'READY',
          createdAt: minutesAgo(10),
          buildingAt: minutesAgo(8),
          ready: minutesAgo(7),
        },
        now
      ),
      { state: 'READY', queueSeconds: 120, buildSeconds: 60 }
    );
    assert.deepEqual(deploymentTiming({ state: 'CANCELED', created: 1 }, now), {
      state: 'CANCELED',
      queueSeconds: null,
      buildSeconds: null,
    });
    assert.equal(deploymentTiming({}, now).queueSeconds, null);
  });

  it('names the junk that starved the 2026-10-20 staging generation', () => {
    const team = [
      staging,
      lyBackup(0, 'BUILDING'),
      ...Array.from({ length: 5 }, (_, i) => lyBackup(i + 1)),
      { name: 'jovie-docs', state: 'READY', meta: { githubCommitRef: 'main' } },
    ];
    const occupants = summarizeTeamQueue(team, now);
    assert.deepEqual(occupants[0], {
      class: 'log-your-body/backup',
      queued: 5,
      building: 1,
      oldestQueuedSeconds: 3900,
    });
    const timing = deploymentTiming(staging, now);
    const verdict = queueVerdict({ lane: 'staging', timing, occupants });
    assert.equal(
      verdict,
      'staging deployment waited 1920s in the Vercel build queue behind log-your-body/backup x6 (vercel-build-queue-starved).'
    );
    const report = renderReport({
      lane: 'staging',
      deployment: staging.id,
      timing,
      occupants,
    });
    assert.ok(report.includes('queue wait 1920s'));
    assert.ok(report.includes('| log-your-body/backup | 5 | 1 | 3900s |'));
  });

  it('stays quiet when the queue is healthy', () => {
    const timing = { state: 'READY', queueSeconds: 0, buildSeconds: 40 };
    assert.equal(
      queueVerdict({ lane: 'production', timing, occupants: [] }),
      null
    );
    assert.ok(
      renderReport({
        lane: 'production',
        deployment: 'dpl_x',
        timing,
        occupants: [],
      }).includes('Team build queue was empty when measured.')
    );
  });

  it('writes outputs and summary from the live API shape, and never throws', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vercel-queue-'));
    const env = {
      VERCEL_TOKEN: 'token',
      VERCEL_ORG_ID: 'team_x',
      GITHUB_OUTPUT: join(dir, 'out'),
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
    };
    const urls = [];
    const fetchImpl = async url => {
      urls.push(String(url));
      const path = new URL(url).pathname;
      const body = path.startsWith('/v13/deployments/')
        ? {
            ...staging,
            readyState: 'READY',
            buildingAt: minutesAgo(1),
            ready: now,
          }
        : { deployments: [lyBackup(1)] };
      return { ok: true, json: async () => body };
    };
    const result = await runCli({
      argv: ['staging', 'https://jovie-futbjw7wr-jovie.vercel.app/'],
      env,
      fetchImpl,
    });
    assert.equal(result.timing.queueSeconds, 1860);
    assert.ok(
      urls[0].includes(
        '/v13/deployments/jovie-futbjw7wr-jovie.vercel.app?teamId=team_x'
      )
    );
    assert.ok(
      readFileSync(env.GITHUB_OUTPUT, 'utf8').includes(
        'queue_seconds=1860\nbuild_seconds=60\n'
      )
    );
    assert.ok(
      readFileSync(env.GITHUB_STEP_SUMMARY, 'utf8').includes(
        '### Vercel build queue (staging)'
      )
    );

    const failing = async () => ({ ok: false, status: 503 });
    assert.equal(
      await runCli({ argv: ['staging', 'dpl_x'], env, fetchImpl: failing }),
      null
    );
    assert.equal(await runCli({ argv: [], env }), null);
    assert.equal(
      await runCli({ argv: ['staging', 'dpl_x'], env: {}, fetchImpl }),
      null
    );
  });
});
