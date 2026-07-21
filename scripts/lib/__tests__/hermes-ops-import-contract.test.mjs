/**
 * Regression for JOV-4331: hermes jobs and the tracker CLI wrapper must
 * import real named exports (TS2305 class). Same incident family as the
 * chdirSync crash-loop fixed in #14527 — bad named imports crash tsx/node
 * at module load, silently killing the launchd-registered jobs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const read = rel => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const OPS_NOTIFY_CONSUMERS = [
  'scripts/hermes/jobs/agentcookie-sync.ts',
  'scripts/hermes/jobs/pipeline-scoreboard.ts',
  'scripts/hermes/jobs/gbrain-health-summary.ts',
  'scripts/hermes/jobs/gstack-nightly-upgrade.ts',
  'scripts/hermes/jobs/codex-issue-shipper.ts',
];

describe('hermes ops-notify import contract (JOV-4331)', () => {
  it('exports sendOpsAlert (not notifyOps)', async () => {
    const mod = await import('../../hermes/lib/ops-notify.ts');
    expect(typeof mod.sendOpsAlert).toBe('function');
    // Avoid `mod.notifyOps` — TS2339 on the scripts typecheck lane.
    expect(Object.hasOwn(mod, 'notifyOps')).toBe(false);
  });

  it('consumers import sendOpsAlert and never notifyOps as a named import', () => {
    for (const rel of OPS_NOTIFY_CONSUMERS) {
      const src = read(rel);
      expect(src, rel).toMatch(
        /import\s*\{[^}]*\bsendOpsAlert\b[^}]*\}\s*from\s*['"]\.\.\/lib\/ops-notify['"]/
      );
      expect(src, rel).not.toMatch(
        /import\s*\{[^}]*\bnotifyOps\b[^}]*\}\s*from\s*['"]\.\.\/lib\/ops-notify['"]/
      );
    }
  });
});

describe('github-transition-issue import contract (JOV-4331)', () => {
  it('imports only real tracker exports', () => {
    const src = read('scripts/github-transition-issue.mjs');
    expect(src).toContain('transitionIssue');
    // Ban the broken import shape only (comments may mention the old name).
    expect(src).not.toMatch(
      /import\s*\{[^}]*\bnormalizeIssueNumber\b[^}]*\}\s*from/
    );
  });

  it('normalizes issue refs like github-claim-issue.mjs (123 or #123)', () => {
    const src = read('scripts/github-transition-issue.mjs');
    expect(src).toContain(".replace(/^#/, '')");
    expect(src).toContain('Number.parseInt');
  });

  // #14553 / JOV-4332: transitionIssue takes `note`, not `comment`.
  it('passes note (not comment) to transitionIssue so status notes are posted', () => {
    const src = read('scripts/github-transition-issue.mjs');
    // Single-level object literal only (avoids matching the file's explanatory comment).
    expect(src).toMatch(/transitionIssue\(\s*\{[^}]*\bnote\b/);
    expect(src).not.toMatch(/transitionIssue\(\s*\{[^}]*\bcomment\b/);
  });
});

describe('scripts typecheck baseline no longer pins the fixed TS2305s', () => {
  it('drops the four repaired TS2305 entries from the baseline', () => {
    const baseline = JSON.parse(read('scripts/typecheck-baseline.json'));
    const files = baseline.files;
    // pipeline-scoreboard had TS2305 as its only error, so the file entry
    // leaves the baseline entirely.
    expect(files['scripts/hermes/jobs/pipeline-scoreboard.ts']).toBeUndefined();
    // The others keep their unrelated baselined errors; only TS2305 leaves.
    expect(
      files['scripts/hermes/jobs/agentcookie-sync.ts']?.TS2305
    ).toBeUndefined();
    expect(
      files['scripts/hermes/jobs/gbrain-health-summary.ts']?.TS2305
    ).toBeUndefined();
    expect(
      files['scripts/github-transition-issue.mjs']?.TS2305
    ).toBeUndefined();
  });

  // #14553: TS2353 for the comment/note param mismatch is fixed; entry leaves baseline.
  it('drops the repaired TS2353 entry for github-transition-issue.mjs', () => {
    const baseline = JSON.parse(read('scripts/typecheck-baseline.json'));
    expect(
      baseline.files['scripts/github-transition-issue.mjs']?.TS2353
    ).toBeUndefined();
  });
});
