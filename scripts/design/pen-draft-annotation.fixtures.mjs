import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
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
