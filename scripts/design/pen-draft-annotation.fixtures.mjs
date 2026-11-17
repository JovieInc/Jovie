import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Run the real blocked CLI in both CI and local fixture environments. */
export function* blockedRuns() {
  for (const githubActions of ['true', 'false']) {
    const out = mkdtempSync(join(tmpdir(), 'pen-draft-blocked-'));
    const res = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./pen-draft.mjs', import.meta.url)),
        '--out',
        out,
      ],
      {
        encoding: 'utf8',
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        env: { PATH: process.env.PATH, GITHUB_ACTIONS: githubActions },
      }
    );
    yield { githubActions, out, res };
  }
}

/** Preserve the blocked receipt, failure status and both annotation modes. */
export function assertBlockedRuns() {
  for (const { githubActions, out, res } of blockedRuns()) {
    assert.equal(res.status, 1);
    assert.match(
      res.stdout,
      /^pen-draft: blocked, missing PEN_CLI_KEY and PEN_GOLDEN_PATH_FILE_URL$/m
    );
    if (githubActions === 'true')
      assert.match(
        res.stdout,
        /^::error title=pen-draft blocked::pen-draft: blocked, missing PEN_CLI_KEY and PEN_GOLDEN_PATH_FILE_URL$/m
      );
    else assert.doesNotMatch(res.stdout, /^::error/m);
    assert.equal(
      JSON.parse(readFileSync(join(out, 'receipt.json'), 'utf8')).blocked,
      'missing PEN_CLI_KEY and PEN_GOLDEN_PATH_FILE_URL'
    );
  }
}
