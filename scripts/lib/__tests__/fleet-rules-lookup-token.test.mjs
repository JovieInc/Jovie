import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const read = path => readFileSync(resolve(ROOT, path), 'utf8');

// 2026-10-26: the repo-wide GITHUB_TOKEN bucket was empty 79% of 02:23-03:23Z while the
// CI App installation token sat at 4861/5000, and Fleet Rules deferred (exit 75) on
// github.token lookups after reading its verdict on the App budget. The lookups now run
// on the App token; github.token is used only for the rerun POST (actions:write).
describe('Fleet Rules lookups run on the CI App token, never github.token', () => {
  function runRerun(env, clientTail) {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-rerun-'));
    try {
      const log = join(dir, 'calls.log');
      const client = join(dir, 'client.mjs');
      writeFileSync(
        client,
        `import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(log)}, (process.env.GH_TOKEN ?? '') + ' ' + process.argv.slice(2).join(' ') + '\\n');
if (process.argv.includes('--jq')) process.stdout.write('true\\n');
${clientTail ?? ''}`
      );
      const result = spawnSync(
        'bash',
        [resolve(ROOT, '.github/scripts/fleet-rules-rerun.sh'), '12345'],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            API_CLIENT: client,
            REPOSITORY: 'o/r',
            ...env,
          },
        }
      );
      let calls = [];
      try {
        calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
      } catch {
        // no calls
      }
      return {
        status: result.status,
        calls,
        output: result.stdout + result.stderr,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('looks the run up with the App token and posts the rerun with github.token', () => {
    const { status, calls } = runRerun({
      GH_TOKEN: 'github-token',
      GH_READ_TOKEN: 'app-token',
    });
    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^app-token .*actions\/runs\/12345\/jobs/);
    expect(calls[1]).toMatch(/^github-token .*-X POST .*rerun-failed-jobs/);
  });

  it('makes no call at all when there is no App token (no fallback to github.token)', () => {
    const { status, calls, output } = runRerun({ GH_TOKEN: 'github-token' });
    expect(status).toBe(0);
    expect(calls).toEqual([]);
    expect(output).toContain('never falls back to github.token');
    expect(
      runRerun({ GH_TOKEN: 'github-token', GH_READ_TOKEN: '' }).calls
    ).toEqual([]);
  });

  it('the verdict script reads on FLEET_TOKEN and skips the lookup without it', () => {
    const verdict = read('.github/scripts/fleet-rules-verdict.sh');
    const lookups = verdict
      .split('\n')
      .filter(line =>
        /ghx repair api "repos\/\$REPOSITORY\/actions\/workflows/.test(line)
      );
    expect(lookups.length).toBeGreaterThan(0);
    for (const line of lookups)
      expect(line).toContain('GH_TOKEN="$FLEET_TOKEN"');
    expect(verdict).toContain('[ -n "${FLEET_TOKEN:-}" ]');
    expect(verdict).toContain(
      'GH_READ_TOKEN="$FLEET_TOKEN" bash .github/scripts/fleet-rules-rerun.sh'
    );
    expect(verdict).not.toMatch(/GH_READ_TOKEN="\$GH_TOKEN"/);
  });

  it('the workflow mints an Actions-read App token for the evidence job and the re-run hop', () => {
    const workflow = read('.github/workflows/fleet-rules-evidence.yml');
    expect(workflow.match(/permission-actions: read/g)).toHaveLength(2);
    expect(workflow).toContain(
      'GH_READ_TOKEN: ${{ steps.fleet-token.outputs.token }}'
    );
    expect(workflow).not.toMatch(/GH_READ_TOKEN:\s*\$\{\{\s*github\.token/);
    // The hop's lookup goes through ghr (App token); only the POSTs use ghx directly.
    expect(workflow).toMatch(/latest="\$\(ghr api /);
    expect(workflow).not.toMatch(/latest="\$\(ghx api /);
  });
});

// 2026-10-25 (run 40160088831): the re-run hop ended red on main with exit 75 when the
// rerun.sh jobs lookup was quota-deferred 19 minutes past the reset — a non-verdict
// filing a false main-failure signal. 2026-10-31 (run 41248056847): it ended red with
// exit 1 after a failed rerun POST (the evidence job's tail re-runs the same failed run;
// the race loser's POST answers HTTP 409). rerun.sh absorbs its own deferrals (green
// no-op, never a pass, relay + quota-deferred-heads doctor own the retry) and treats a
// lost re-run race as done. Real errors stay red.
describe('fleet-rules-rerun stays green on non-verdicts (quota deferral, lost re-run race)', () => {
  function runRerun(env, clientTail) {
    const dir = mkdtempSync(join(tmpdir(), 'fleet-rerun-'));
    try {
      const log = join(dir, 'calls.log');
      const client = join(dir, 'client.mjs');
      writeFileSync(
        client,
        `import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(log)}, (process.env.GH_TOKEN ?? '') + ' ' + process.argv.slice(2).join(' ') + '\\n');
if (process.argv.includes('--jq')) process.stdout.write('true\\n');
${clientTail ?? ''}`
      );
      const result = spawnSync(
        'bash',
        [resolve(ROOT, '.github/scripts/fleet-rules-rerun.sh'), '12345'],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH,
            API_CLIENT: client,
            REPOSITORY: 'o/r',
            ...env,
          },
        }
      );
      let calls = [];
      try {
        calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
      } catch {
        // no calls
      }
      return {
        status: result.status,
        calls,
        output: result.stdout + result.stderr,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('treats a lost re-run race (HTTP 409) on the POST as done, not a failure', () => {
    const { status, calls, output } = runRerun(
      { GH_TOKEN: 'github-token', GH_READ_TOKEN: 'app-token' },
      `if (!process.argv.includes('--jq')) {
  process.stderr.write('gh: HTTP 409 Conflict: this run and its references are being updated\\n');
  process.exit(1);
}
`
    );
    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^app-token .*actions\/runs\/12345\/jobs/);
    expect(calls[1]).toMatch(/^github-token .*-X POST .*rerun-failed-jobs/);
    expect(output).toContain('already being re-run');
    expect(output).not.toContain('Re-ran PR Ready');
  });

  it('absorbs a deferred jobs lookup as a green no-op, never as a decision', () => {
    const { status, output } = runRerun(
      { GH_TOKEN: 'github-token', GH_READ_TOKEN: 'app-token' },
      `if (process.argv.includes('--jq')) {
  process.stderr.write('::warning::github-quota-deferred: gh api x primary after 1 attempt(s) until 2099-01-01T00:00:00.000Z; not a verdict on this change.\\n');
  process.exit(75);
}
`
    );
    expect(status).toBe(0);
    expect(output).toContain('not a verdict');
    expect(output).toContain('fleet-rules-rerun made no decision');
    expect(output).not.toContain('Re-ran PR Ready');
  });

  it('absorbs a deferred rerun POST as a green no-op', () => {
    const { status, output } = runRerun(
      { GH_TOKEN: 'github-token', GH_READ_TOKEN: 'app-token' },
      `if (!process.argv.includes('--jq')) {
  process.stderr.write('primary after 1 attempt(s) until 2099-01-01T00:00:00.000Z\\n');
  process.exit(75);
}
`
    );
    expect(status).toBe(0);
    expect(output).toContain('fleet-rules-rerun made no decision');
    expect(output).not.toContain('Re-ran PR Ready');
  });

  it('keeps a real POST error red', () => {
    const { status, output } = runRerun(
      { GH_TOKEN: 'github-token', GH_READ_TOKEN: 'app-token' },
      `if (!process.argv.includes('--jq')) {
  process.stderr.write('gh: HTTP 403 Forbidden\\n');
  process.exit(1);
}
`
    );
    expect(status).toBe(1);
    expect(output).toContain('HTTP 403');
  });

  it('keeps a real lookup error red (only 75 is a non-verdict)', () => {
    const { status, output } = runRerun(
      { GH_TOKEN: 'github-token', GH_READ_TOKEN: 'app-token' },
      `if (process.argv.includes('--jq')) {
  process.stderr.write('gh: HTTP 404 Not Found\\n');
  process.exit(1);
}
`
    );
    expect(status).toBe(1);
    expect(output).toContain('HTTP 404');
  });

  it('rerun.sh carries the deferral and 409 semantics the hop relies on', () => {
    const script = read('.github/scripts/fleet-rules-rerun.sh');
    expect(script).toContain('deferred_exit()');
    expect(script).toMatch(
      /::notice::github-quota-deferred; fleet-rules-rerun made no decision/
    );
    expect(script).toContain('HTTP 409');
    // Real errors must stay red: only 75 reaches deferred_exit.
    expect(script).toMatch(/lookup_rc" -eq 75/);
    expect(script).not.toMatch(/\|\| deferred_exit$/);
  });
});
