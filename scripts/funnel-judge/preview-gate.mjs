#!/usr/bin/env node
// Funnel judge as a lane gate (JOV-7765, approved option A).
//
//   node scripts/funnel-judge/preview-gate.mjs --pr <n> --sha <head> --ref <branch>
//
// Only PRs that touch a funnel surface are judged; anything else exits 0.
// For a funnel PR the gate reuses or dispatches the existing manual CI
// preview deploy (ci.yml run_preview_deploy) for the exact head, waits for
// the deployment URL with backoff (at most one GitHub call per 30s, 15-minute
// cap), then runs the funnel judge against it. Exit 0 = pass, 1 = the judge
// failed the funnel, 2 = no judgement possible (no preview, no bypass
// secret, scorer error); the lane holds the PR on any non-zero exit.

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

export const REPO = 'JovieInc/Jovie';
const ROOT = resolve(new URL('../..', import.meta.url).pathname);

/** Funnel steps' source: profile, /start, claim, onboarding, billing, admission. */
const FUNNEL_SURFACE =
  /^apps\/web\/(?:app\/(?:\[username\]|\(dynamic\)\/start|claim|onboarding|billing|\(profile-admission\))\/|components\/features\/(?:profile|onboarding)\/)/;
const NOT_SURFACE =
  /(?:\.test\.|\.spec\.|\.stories\.|\/__tests__\/|\/fixtures?\/)/;

export function funnelPaths(paths) {
  return paths.filter(
    path => FUNNEL_SURFACE.test(path) && !NOT_SURFACE.test(path)
  );
}

/** The preview URL the readiness step printed in its env block. */
export function parseDeploymentUrl(log) {
  const match = /DEPLOYMENT_URL:\s*(https:\/\/[^\s"']+)/.exec(log);
  return match ? match[1] : null;
}

/** 30s, 45s, 60s ... capped at 120s: never more than one call per 30s. */
export function backoffMs(attempt) {
  return Math.min(30_000 + attempt * 15_000, 120_000);
}

export const POLL_CAP_MS = 15 * 60_000;
const PREVIEW_JOB = 'Preview Deploy (manual)';

function ghJson(args, gh) {
  const result = gh(['api', ...args]);
  if (result.status !== 0) {
    throw new Error(
      `gh api ${args[0]} failed: ${
        String(result.stderr ?? '')
          .trim()
          .split('\n')[0]
      }`
    );
  }
  return JSON.parse(String(result.stdout || 'null'));
}

/**
 * Reuses a dispatched CI run for this head or dispatches one, then waits
 * for the preview job and returns its URL, or a reason it has none.
 *
 * @param {{ sha: string, ref: string, pr: number, workId?: string,
 *   gh: (args: string[]) => { status: number | null, stdout: string, stderr?: string },
 *   sleep: (ms: number) => Promise<void>, now: () => number }} input
 */
export async function previewUrlFor(input) {
  const { sha, ref, gh, sleep, now } = input;
  const runsPath = `repos/${REPO}/actions/workflows/ci.yml/runs?event=workflow_dispatch&head_sha=${sha}&per_page=5`;
  const started = now();
  let dispatched = false;
  /** Once the run is known, each poll is a single jobs call. */
  let runId = null;
  for (let attempt = 0; ; attempt++) {
    if (runId === null) {
      const run = (ghJson([runsPath], gh)?.workflow_runs ?? [])[0];
      if (run) {
        runId = run.id;
      } else if (!dispatched) {
        const branch = ghJson(
          [`repos/${REPO}/branches/${encodeURIComponent(ref)}`],
          gh
        );
        if (branch?.commit?.sha !== sha) {
          return {
            url: null,
            reason: `branch ${ref} has moved past ${sha.slice(0, 12)}; the gate judges exact heads only`,
          };
        }
        const fired = gh([
          'workflow',
          'run',
          'ci.yml',
          '--repo',
          REPO,
          '--ref',
          ref,
          '-f',
          'run_preview_deploy=true',
          '-f',
          `preview_work_id=${input.workId ?? 'manual-dispatch'}`,
          '-f',
          `preview_reason=funnel-judge gate for PR #${input.pr} at ${sha.slice(0, 12)}`,
        ]);
        if (fired.status !== 0) {
          return {
            url: null,
            reason: `could not dispatch the preview deploy: ${
              String(fired.stderr ?? '')
                .trim()
                .split('\n')[0]
            }`,
          };
        }
        dispatched = true;
      }
    } else {
      const jobs =
        ghJson([`repos/${REPO}/actions/runs/${runId}/jobs?per_page=100`], gh)
          ?.jobs ?? [];
      const job = jobs.find(item => item.name === PREVIEW_JOB);
      if (job?.status === 'completed') {
        if (job.conclusion !== 'success') {
          return {
            url: null,
            reason: `preview deploy ${job.conclusion} (run ${runId})`,
          };
        }
        const log = gh(['api', `repos/${REPO}/actions/jobs/${job.id}/logs`]);
        const url = parseDeploymentUrl(String(log.stdout ?? ''));
        return url
          ? { url, reason: null }
          : {
              url: null,
              reason: `preview deploy succeeded but printed no URL (job ${job.id})`,
            };
      }
      if (
        !job &&
        jobs.length > 0 &&
        jobs.every(item => item.status === 'completed')
      ) {
        return {
          url: null,
          reason: `run ${runId} finished without a preview job`,
        };
      }
    }
    const wait = backoffMs(attempt);
    if (now() - started + wait > POLL_CAP_MS) {
      return {
        url: null,
        reason: `no preview URL within ${POLL_CAP_MS / 60_000} minutes`,
      };
    }
    await sleep(wait);
  }
}

/** The bypass secret for protected previews, from Doppler at call time. */
function readBypassSecret() {
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    return process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
  const result = spawnSync(
    'doppler',
    [
      'secrets',
      'get',
      'VERCEL_AUTOMATION_BYPASS_SECRET',
      '--plain',
      '--project',
      'jovie-web',
      '--config',
      'dev',
    ],
    { encoding: 'utf8', timeout: 15_000 }
  );
  return result.status === 0 ? String(result.stdout).trim() || null : null;
}

function fail(code, reason) {
  console.log(`[funnel-gate] FAIL: ${reason}`);
  return code;
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      pr: { type: 'string' },
      sha: { type: 'string' },
      ref: { type: 'string' },
      base: { type: 'string', default: 'origin/main' },
      'work-id': { type: 'string' },
    },
  });
  if (!values.pr || !values.sha || !values.ref) {
    console.error(
      'usage: preview-gate.mjs --pr <n> --sha <head> --ref <branch> [--base origin/main]'
    );
    return 2;
  }
  const diff = spawnSync(
    'git',
    ['diff', '--name-only', `${values.base}...${values.sha}`],
    {
      cwd: ROOT,
      encoding: 'utf8',
    }
  );
  if (diff.status !== 0)
    return fail(2, `cannot diff ${values.base}...${values.sha}`);
  const touched = funnelPaths(diff.stdout.split('\n').filter(Boolean));
  if (touched.length === 0) {
    console.log('[funnel-gate] no funnel surface touched; skipped');
    return 0;
  }
  console.log(
    `[funnel-gate] funnel surfaces touched: ${touched.slice(0, 5).join(', ')}`
  );
  const preview = await previewUrlFor({
    sha: values.sha,
    ref: values.ref,
    pr: Number(values.pr),
    workId: values['work-id'],
    gh: args => spawnSync('gh', args, { encoding: 'utf8', timeout: 60_000 }),
    sleep: ms => new Promise(done => setTimeout(done, ms)),
    now: () => Date.now(),
  });
  if (!preview.url) return fail(2, preview.reason);
  const secret = readBypassSecret();
  if (!secret)
    return fail(
      2,
      'VERCEL_AUTOMATION_BYPASS_SECRET unavailable from Doppler; cannot open the protected preview'
    );

  console.log(`[funnel-gate] judging ${preview.url}`);
  const out = mkdtempSync(join(tmpdir(), 'funnel-gate-'));
  const code = await new Promise(done => {
    const child = spawn(
      process.execPath,
      [
        join(ROOT, 'scripts/funnel-judge/run.mjs'),
        '--base-url',
        preview.url,
        '--out',
        out,
        '--trend',
        join(out, 'trend.jsonl'),
        '--label',
        `pr-${values.pr}`,
      ],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, VERCEL_AUTOMATION_BYPASS_SECRET: secret },
      }
    );
    child.on('error', () => done(2));
    child.on('close', exit => done(exit ?? 2));
  });
  if (code === 0) {
    console.log('[funnel-gate] PASS');
    return 0;
  }
  return fail(
    code === 1 ? 1 : 2,
    code === 1
      ? `funnel judge failed the funnel (receipt in ${out})`
      : `funnel judge errored (exit ${code}); receipt in ${out}`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
) {
  main().then(code => {
    process.exitCode = code;
  });
}
