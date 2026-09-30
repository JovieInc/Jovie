import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPORTS = [
  'docs/TEST_COVERAGE_HEATMAP.md',
  'apps/web/reports/test-coverage-snapshot.json',
];

// The audited commit stays the parent: never rebase measured data onto a
// different source revision. Publication is a draft PR, subject to normal CI.
export function publishCoverageReport({
  cwd = process.cwd(),
  env = process.env,
  gh = args => execFileSync('gh', args, { cwd, env, encoding: 'utf8' }).trim(),
} = {}) {
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
  if (changed.some(path => !REPORTS.includes(path))) {
    throw new Error('Refusing to publish unrelated tracked changes');
  }
  if (changed.length === 0) return { status: 'unchanged', source };

  // A rerun has its own attempt ref. Never force-push or replace another report.
  const branch = `bot/coverage-audit-${runId}-${attempt}`;
  const runUrl = `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
  git('switch', '-c', branch);
  git('config', 'user.name', 'github-actions[bot]');
  git(
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com'
  );
  git('add', '--', ...REPORTS);
  git(
    'commit',
    '-m',
    'chore(testing): refresh changed-evidence heatmap',
    '-m',
    `Measured source: ${source}`
  );
  gh(['auth', 'setup-git', '--hostname', 'github.com']);
  git('push', 'origin', `HEAD:refs/heads/${branch}`);

  const bodyDir = mkdtempSync(join(tmpdir(), 'coverage-report-'));
  try {
    const bodyFile = join(bodyDir, 'body.md');
    writeFileSync(
      bodyFile,
      `Refresh the generated coverage heatmap and baseline from [audit ${runId}](${runUrl}).\n\n` +
        `Measured source: \`${source}\`. The report commit retains that exact parent.\n\n` +
        'Full web coverage and RED-surface drift checks passed before generation. ' +
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
      'chore(testing): refresh changed-evidence heatmap',
      '--body-file',
      bodyFile,
    ]);
    if (!url.startsWith(`https://github.com/${repo}/pull/`)) {
      throw new Error('Coverage report PR creation returned no receipt');
    }
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `Coverage report: ${url}\nMeasured source: ${source}\n`
      );
    }
    return { status: 'published', source, branch, url };
  } finally {
    rmSync(bodyDir, { recursive: true, force: true });
  }
}
