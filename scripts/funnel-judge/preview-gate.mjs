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
import { mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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

/** A preview host GitHub's log mask replaced with asterisks cannot be opened. */
export function usablePreviewUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.vercel.app') &&
      !url.hostname.includes('*')
    );
  } catch {
    return false;
  }
}

/**
 * The preview URL the readiness step printed. Prefer the base64 line: GitHub
 * masks secret substrings in the plain `DEPLOYMENT_URL` env dump, which
 * punches asterisks into the hostname.
 */
export function parseDeploymentUrl(log) {
  const text = String(log ?? '');
  const encoded = /DEPLOYMENT_URL_B64:\s*([A-Za-z0-9+/=]+)/.exec(text);
  if (encoded) {
    const decoded = Buffer.from(encoded[1], 'base64').toString('utf8').trim();
    if (usablePreviewUrl(decoded)) return decoded;
  }
  const match = /DEPLOYMENT_URL:\s*(https:\/\/[^\s"']+)/.exec(text);
  return match && usablePreviewUrl(match[1]) ? match[1] : null;
}

/** 30s, 45s, 60s ... capped at 120s: never more than one call per 30s. */
export function backoffMs(attempt) {
  return Math.min(30_000 + attempt * 15_000, 120_000);
}

export const POLL_CAP_MS = 15 * 60_000;
const PREVIEW_JOB = 'Preview Deploy (manual)';

function plainGhOutput(text) {
  return String(text ?? '').replace(/\u001B\[[0-9;]*m/g, '');
}

function ghJson(args, gh) {
  const result = gh(['api', ...args]);
  if (result.status !== 0) {
    throw new Error(
      `gh api ${args[0]} failed: ${
        plainGhOutput(result.stderr).trim().split('\n')[0]
      }`
    );
  }
  return JSON.parse(plainGhOutput(result.stdout).trim() || 'null');
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

const BYPASS_SECRET = 'VERCEL_AUTOMATION_BYPASS_SECRET';
const DOPPLER_PROJECT = 'jovie-web';
const DOPPLER_CONFIG = 'dev';

function unquote(value) {
  const text = String(value ?? '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * Directories whose saved Doppler CLI login is `jovie-web` / `dev`.
 * Lane worktrees live outside the checkout the token was scoped to, so
 * `doppler` from the worktree has no token unless `--scope` points here.
 */
export function parseDopplerScopes(
  text,
  { project = DOPPLER_PROJECT, config = DOPPLER_CONFIG } = {}
) {
  const scopes = [];
  let section = null;
  let scopeIndent = null;
  let currentPath = null;
  let current = null;
  const flush = () => {
    if (
      section === 'scoped' &&
      currentPath &&
      current?.project === project &&
      current?.config === config
    ) {
      scopes.push(currentPath);
    }
    currentPath = null;
    current = null;
  };
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    if (indent === 0) {
      flush();
      section = /^([A-Za-z0-9_-]+):/.exec(body)?.[1] ?? null;
      scopeIndent = null;
      continue;
    }
    if (section !== 'scoped') continue;
    if (scopeIndent === null) scopeIndent = indent;
    if (indent === scopeIndent && body.endsWith(':')) {
      flush();
      currentPath = unquote(body.slice(0, -1).trim());
      current = {};
      continue;
    }
    if (!current || indent <= scopeIndent) continue;
    const projectField = /^enclave\.project:\s*(.+)$/.exec(body);
    const configField = /^enclave\.config:\s*(.+)$/.exec(body);
    if (projectField) current.project = unquote(projectField[1]);
    if (configField) current.config = unquote(configField[1]);
  }
  flush();
  return scopes;
}

function loadDopplerDevScopes(env = process.env) {
  try {
    const dir = env.DOPPLER_CONFIG_DIR || join(homedir(), '.doppler');
    return parseDopplerScopes(readFileSync(join(dir, '.doppler.yaml'), 'utf8'));
  } catch {
    return [];
  }
}

function dopplerBypassValue(spawn, scope) {
  const args = [
    'secrets',
    'get',
    BYPASS_SECRET,
    '--plain',
    '--project',
    DOPPLER_PROJECT,
    '--config',
    DOPPLER_CONFIG,
  ];
  if (scope) args.push('--scope', scope);
  let result;
  try {
    result = spawn('doppler', args, { encoding: 'utf8', timeout: 15_000 });
  } catch {
    return null;
  }
  if (result?.status !== 0) return null;
  return String(result.stdout ?? '').trim() || null;
}

/** The bypass secret for protected previews, from the env or Doppler. */
export function readBypassSecret({
  env = process.env,
  spawn = spawnSync,
  scopes,
} = {}) {
  const fromEnv = String(env[BYPASS_SECRET] ?? '').trim();
  if (fromEnv) return fromEnv;
  const cwdValue = dopplerBypassValue(spawn);
  if (cwdValue) return cwdValue;
  const seen = new Set([process.cwd()]);
  for (const scope of scopes ?? loadDopplerDevScopes(env)) {
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    const value = dopplerBypassValue(spawn, scope);
    if (value) return value;
  }
  return null;
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
    gh: args =>
      spawnSync('gh', args, {
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      }),
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
