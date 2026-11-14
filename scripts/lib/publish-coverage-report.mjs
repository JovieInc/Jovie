import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retireGeneratedReports } from './retire-coverage-reports.mjs';

const NIGHTLY = {
  files: [
    'docs/NIGHTLY_TESTING_AGENT_REPORT.md',
    'apps/web/reports/nightly-agent/last-run.json',
  ],
  branch: 'nightly-evidence',
  title: 'chore(testing): refresh nightly testing evidence',
  description:
    'Refresh nightly testing evidence, including recorded failures and missing evidence',
  evidence:
    'Publication does not imply that the nightly tests passed; inspect the recorded workflow conclusion and evidence warnings.',
};

// A report PR still in flight absorbs newer measurements for this long. Both
// producers run on most pushes to main, so one PR per run opened 45 of the 113
// PRs on 2026-10-12, and 162 of 199 PRs closed unmerged in the week before were
// superseded report drafts. The window bounds staleness; a report PR that has
// not landed after it is replaced and retired as before.
export const REPORT_COALESCE_MS = 6 * 60 * 60 * 1000;

/**
 * The open report PR of this profile created within the coalesce window. A
 * conflicted one can never land (its parent is the pinned measured source, so
 * a later report merging over the same files makes it DIRTY): it absorbs
 * nothing, and the next publication replaces and retires it (#21585,
 * 2026-10-13 09:22Z).
 */
export function inFlightReport(
  openPrs,
  branch,
  now,
  windowMs = REPORT_COALESCE_MS
) {
  const owned = new RegExp(`^bot/${branch}-[1-9]\\d*-[1-9]\\d*$`);
  return (
    openPrs
      .filter(
        pr =>
          owned.test(pr.headRefName ?? '') &&
          pr.mergeable !== 'CONFLICTING' &&
          now - Date.parse(pr.createdAt) < windowMs
      )
      .sort((a, b) => b.number - a.number)[0] ?? null
  );
}

// The retirement inventory lists up to 1000 open PRs with full bodies, and a
// PR body alone can reach 64 KiB, so the child_process default of 1 MiB died
// with ENOBUFS once the fleet grew (run 41049117742). The buffer only grows to
// the observed output; the headroom covers 1000 escaped 64 KiB bodies.
export const GH_MAX_BUFFER = 128 * 1024 * 1024;

// The audited commit stays the parent: never rebase measured data onto a
// different source revision. Publication is a draft PR, subject to normal CI.
function publishReport(
  {
    cwd = process.cwd(),
    env = process.env,
    gh = args =>
      execFileSync('gh', args, {
        cwd,
        env,
        encoding: 'utf8',
        maxBuffer: GH_MAX_BUFFER,
      }).trim(),
    now = Date.now(),
    recordOrigin = (pr, head) =>
      execFileSync(
        'python3',
        [
          new URL('../shipping_origin.py', import.meta.url).pathname,
          'emit-automation',
          '--pr',
          pr,
          '--head-sha',
          head,
        ],
        { cwd, env, encoding: 'utf8', timeout: 60000 }
      ),
  } = {},
  profile = NIGHTLY
) {
  const git = (...args) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();
  const source = env.GITHUB_SHA;
  const repo = env.GITHUB_REPOSITORY;
  const runId = env.GITHUB_RUN_ID;
  const attempt = env.GITHUB_RUN_ATTEMPT;
  if (
    !/^[a-f0-9]{40}$/.test(source ?? '') ||
    !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') ||
    !/^[1-9]\d*$/.test(runId ?? '') ||
    !/^[1-9]\d*$/.test(attempt ?? '')
  ) {
    throw new Error('Invalid coverage producer identity');
  }
  if (git('rev-parse', 'HEAD') !== source) {
    throw new Error('Coverage checkout differs from the measured source SHA');
  }
  const changed = git('diff', 'HEAD', '--name-only')
    .split('\n')
    .filter(Boolean);
  if (changed.some(path => !profile.files.includes(path))) {
    throw new Error('Refusing to publish unrelated tracked changes');
  }
  if (changed.length === 0) return { status: 'unchanged', source };
  const inFlight = inFlightReport(
    JSON.parse(
      gh([
        'pr',
        'list',
        '--repo',
        repo,
        '--state',
        'open',
        '--base',
        'main',
        '--limit',
        '1000',
        '--json',
        'number,headRefName,createdAt,mergeable',
      ]) || '[]'
    ),
    profile.branch,
    now
  );
  if (inFlight) {
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `Report coalesced into #${inFlight.number}; measured source ${source} not published.\n`
      );
    }
    return { status: 'coalesced', source, into: inFlight.number };
  }

  // A rerun has its own attempt ref. Never force-push or replace another report.
  const branch = `bot/${profile.branch}-${runId}-${attempt}`;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
  git('switch', '-c', branch);
  git('config', 'user.name', 'github-actions[bot]');
  git(
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com'
  );
  git('add', '--', ...profile.files);
  git('commit', '-m', profile.title, '-m', `Measured source: ${source}`);
  gh(['auth', 'setup-git', '--hostname', 'github.com']);
  for (let attempt = 1; ; attempt++) {
    try {
      git('push', 'origin', `HEAD:refs/heads/${branch}`);
      break;
    } catch (error) {
      const stderr =
        error && typeof error === 'object' && 'stderr' in error
          ? String(error.stderr)
          : '';
      // GitHub can time out checking workflow permissions on a report-only
      // push. Retry that check on the same commit, never a permission denial.
      if (
        attempt >= 3 ||
        !stderr.includes(
          'Unable to determine if workflow can be created or updated due to timeout'
        )
      ) {
        throw error;
      }
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        attempt * 1000
      );
    }
  }

  const bodyDir = mkdtempSync(join(tmpdir(), 'coverage-report-'));
  try {
    const bodyFile = join(bodyDir, 'body.md');
    writeFileSync(
      bodyFile,
      `${profile.description} from [audit ${runId}](${runUrl}).\n\n` +
        `Measured source: \`${source}\`. The report commit retains that exact parent.\n\n` +
        `${profile.evidence} ` +
        'This report does not measure later commits. Review and land through normal CI and the native merge queue.\n'
    );
    const url = gh([
      'pr',
      'create',
      '--draft',
      '--repo',
      repo,
      '--base',
      'main',
      '--head',
      branch,
      '--title',
      profile.title,
      '--body-file',
      bodyFile,
    ]);
    if (!url.startsWith(`https://github.com/${repo}/pull/`)) {
      throw new Error('Coverage report PR creation returned no receipt');
    }
    recordOrigin(url, git('rev-parse', 'HEAD'));
    const retired = retireGeneratedReports({
      gh,
      repo,
      url,
      source,
      profile: profile.branch,
      isAncestor: (older, newer) => {
        try {
          git('merge-base', '--is-ancestor', older, newer);
          return true;
        } catch {
          return false;
        }
      },
    });
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `Coverage report: ${url}\nMeasured source: ${source}\nRetired reports: ${retired.join(', ') || 'none'}\n`
      );
    }
    return { status: 'published', source, branch, url };
  } finally {
    rmSync(bodyDir, { recursive: true, force: true });
  }
}

export function publishNightlyReport(options = {}) {
  return publishReport(options, NIGHTLY);
}

const SNAPSHOT = 'apps/web/reports/test-coverage-snapshot.json';

/** Restore from GitHub's successful main-run artifacts, never from a PR or a
 * failed audit. The existing upload-artifact step owns publication/retention. */
export function restoreCoverageBaseline({
  cwd = process.cwd(),
  env = process.env,
  baselineFile = join(cwd, SNAPSHOT),
  gh = args =>
    execFileSync('gh', args, {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: GH_MAX_BUFFER,
    }).trim(),
} = {}) {
  const repo = env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) {
    throw new Error('Invalid coverage repository');
  }
  const { workflow_runs: runs } = JSON.parse(
    gh([
      'api',
      `repos/${repo}/actions/workflows/test-coverage-audit.yml/runs?branch=main&status=success&per_page=1`,
    ])
  );
  if (!Array.isArray(runs))
    throw new Error('Invalid coverage workflow inventory');
  // Initial bootstrap only. Transport/auth/expiry/validation errors fail closed.
  if (runs.length === 0) return { status: 'bootstrap', baseline: SNAPSHOT };
  const run = runs[0];
  if (
    !Number.isSafeInteger(run.id) ||
    run.id <= 0 ||
    run.repository?.full_name !== repo ||
    run.head_repository?.full_name !== repo ||
    run.path !== '.github/workflows/test-coverage-audit.yml' ||
    run.head_branch !== 'main' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !/^[a-f0-9]{40}$/.test(run.head_sha ?? '')
  ) {
    throw new Error('Invalid coverage baseline provenance');
  }
  execFileSync('git', ['merge-base', '--is-ancestor', run.head_sha, 'HEAD'], {
    cwd,
  });
  const dir = mkdtempSync(join(tmpdir(), 'coverage-baseline-'));
  try {
    gh([
      'run',
      'download',
      String(run.id),
      '--repo',
      repo,
      '--name',
      `coverage-audit-${run.id}`,
      '--dir',
      dir,
    ]);
    const raw = readFileSync(join(dir, SNAPSHOT), 'utf8');
    const snapshot = JSON.parse(raw);
    if (
      !snapshot?.surfaces ||
      !Object.keys(snapshot.surfaces).length ||
      !Number.isFinite(Date.parse(snapshot.generated_at)) ||
      Object.values(snapshot.surfaces).some(
        surface =>
          !surface ||
          !Number.isFinite(surface.coverage_pct) ||
          surface.coverage_pct < 0 ||
          surface.coverage_pct > 100 ||
          !Number.isFinite(surface.branch_pct) ||
          surface.branch_pct < 0 ||
          surface.branch_pct > 100 ||
          !Number.isFinite(surface.risk_score) ||
          !['RED', 'YELLOW', 'GREEN'].includes(surface.status)
      )
    ) {
      throw new Error('Invalid coverage artifact snapshot');
    }
    writeFileSync(baselineFile, raw);
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `Coverage baseline: https://github.com/${repo}/actions/runs/${run.id}, measured source ${run.head_sha}.\n`
      );
    }
    return { status: 'restored', source: run.head_sha, run: run.id };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
