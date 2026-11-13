import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileSurvivorIssues } from '../../mutation-sweep-file-issues.mjs';

/** A task directory with two fileable modules. */
function tasksDir() {
  const dir = mkdtempSync(join(tmpdir(), 'census-stop-'));
  for (const name of ['a', 'b', 'c']) {
    writeFileSync(
      join(dir, `${name}.json`),
      JSON.stringify({
        file: `lib/${name}.ts`,
        sha: 'a'.repeat(40),
        score: 50,
        valid: 10,
        tests: [`lib/${name}.test.ts`],
        survivors: [
          {
            fingerprint: `fp-${name}`,
            file: `lib/${name}.ts`,
            line: 3,
            mutator: 'ConditionalExpression',
            status: 'Survived',
            original: 'x > 1',
            replacement: 'true',
            context: 'const y = x > 1;',
          },
        ],
      })
    );
  }
  return dir;
}

test('filing stops at the first rate-limited upsert and leaves the rest unfiled', async () => {
  const dir = tasksDir();
  try {
    /** @type {string[]} */
    const calls = [];
    const { filed, unfiled } = await fileSurvivorIssues({
      tasksDir: dir,
      enabled: true,
      upsert: /** @type {any} */ (
        async payload => {
          calls.push(payload.fingerprint);
          return { ok: false, reason: 'linear_rate_limited', resetAt: 1234 };
        }
      ),
    });
    // The first module fails rate-limited; b and c are never attempted.
    assert.equal(calls.length, 1);
    assert.equal(filed, 0);
    assert.equal(unfiled, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('filing continues over ordinary results and counts only non-rate-limited upserts', async () => {
  const dir = tasksDir();
  try {
    let calls = 0;
    const { filed, unfiled } = await fileSurvivorIssues({
      tasksDir: dir,
      enabled: true,
      upsert: /** @type {any} */ (
        async () => {
          calls += 1;
          return calls === 2
            ? { ok: false, reason: 'linear_search_http' }
            : {
                ok: true,
                action: 'created',
                url: 'https://linear.app/jovie/issue/JOV-1',
              };
        }
      ),
    });
    assert.equal(calls, 3);
    assert.equal(filed, 3);
    assert.equal(unfiled, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
