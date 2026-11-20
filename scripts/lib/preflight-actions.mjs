// Actions backend for the pre-push gate. The hook runs before the push, so the
// commit is not on GitHub yet. Safest option: push the exact sha to a scratch
// ref refs/preflight/<sha> (never a branch: no PR, no CI trigger, no deploy),
// dispatch .github/workflows/preflight-remote.yml on it, read the evidence
// artifact, then delete the scratch ref. The scratch push skips the pre-push
// gate only when EVERY pushed ref is under refs/preflight/ (see .husky/pre-push);
// the real branch push still runs the full gate. Not --no-verify.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evidenceMatches } from './prepush-offload.mjs';

export const WORKFLOW = 'preflight-remote.yml';
const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });

export function scratchRef(sha) {
  return `refs/preflight/${sha}`;
}

/** Returns the exit code the hook should use; 127 = backend unavailable (infra). */
export async function runActions({ repo, sha, tree, log = console.error }) {
  const ref = scratchRef(sha);
  const env = { ...process.env, JOVIE_PREFLIGHT_SCRATCH_PUSH: '1' };
  const push = run('git', ['push', '--quiet', 'origin', `${sha}:${ref}`], {
    cwd: repo,
    env,
    stdio: 'inherit',
  });
  if (push.status !== 0) {
    log('[preflight:actions] scratch ref push failed');
    return 127;
  }
  const cleanup = () =>
    run('git', ['push', '--quiet', 'origin', `:${ref}`], {
      cwd: repo,
      env,
      stdio: 'ignore',
    });
  try {
    const disp = run(
      'gh',
      [
        'workflow',
        'run',
        WORKFLOW,
        '--ref',
        'main',
        '-f',
        `sha=${sha}`,
        '-f',
        `tree=${tree}`,
      ],
      { cwd: repo }
    );
    if (disp.status !== 0) {
      log(`[preflight:actions] dispatch unavailable: ${disp.stderr.trim()}`);
      return 127;
    }
    let id = '';
    for (let i = 0; i < 30 && !id; i += 1) {
      await new Promise(r => setTimeout(r, 4000));
      const list = run(
        'gh',
        [
          'run',
          'list',
          '--workflow',
          WORKFLOW,
          '--json',
          'databaseId,displayTitle',
          '--limit',
          '30',
        ],
        { cwd: repo }
      );
      try {
        id = String(
          JSON.parse(list.stdout || '[]').find(r =>
            r.displayTitle.includes(sha)
          )?.databaseId ?? ''
        );
      } catch {
        /* retry */
      }
    }
    if (!id) return 127;
    log(`[preflight:actions] run ${id} on ${sha.slice(0, 9)} (hosted runner)`);
    const watch = run(
      'gh',
      ['run', 'watch', id, '--interval', '10', '--exit-status'],
      { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] }
    );
    const dir = mkdtempSync(path.join(tmpdir(), 'preflight-ev-'));
    run('gh', ['run', 'download', id, '-n', 'preflight-evidence', '-D', dir], {
      cwd: repo,
    });
    let ev = null;
    try {
      ev = JSON.parse(readFileSync(path.join(dir, 'evidence.json'), 'utf8'));
    } catch {
      /* none */
    }
    if (watch.status === 0 && evidenceMatches(ev, { sha, tree })) {
      log(`[preflight:actions] pass, evidence matches ${sha} / ${tree}`);
      return 0;
    }
    log(
      `[preflight:actions] FAIL (run ${id}); see gh run view ${id} --log-failed`
    );
    return 1;
  } finally {
    cleanup();
  }
}
