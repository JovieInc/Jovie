import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Regression for JOV-12497: the REST fallback parsed the `gh api -i`
// response with `printf | awk` streams whose early-exit header awks closed
// the pipe; a >64KiB single-commit response then SIGPIPEd the writer under
// pipefail and the script died before printing a SHA. The fix parses from a
// temp file; this test proves the large-response path end to end.
test('resolve-main-sha survives a large REST response without a broken pipe', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-resolve-main-sha-pipe-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const sha = 'c'.repeat(40);
  const mockBin = join(root, 'bin');
  await mkdir(join(root, '.github/scripts'), { recursive: true });
  await mkdir(mockBin);
  await copyFile(
    new URL('../.github/scripts/resolve-main-sha.sh', import.meta.url),
    join(root, '.github/scripts/resolve-main-sha.sh')
  );
  // git ls-remote always fails so the script must reach the REST fallback,
  // the path that produced the JOV-12497 broken pipe.
  await writeFile(join(mockBin, 'git'), '#!/usr/bin/env bash\nexit 1\n', {
    mode: 0o755,
  });
  // A 200 response whose JSON body exceeds the 64KiB pipe buffer, with the
  // early-exit x-ratelimit headers first, the exact 2026-11-13 failure shape.
  await writeFile(
    join(mockBin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" != *"repos/JovieInc/Jovie/commits/main"* ]]; then
  printf 'unexpected gh endpoint: %s\\n' "$*" >&2
  exit 64
fi
printf 'HTTP/2 200\\r\\n'
printf 'x-ratelimit-remaining: 4990\\r\\n'
printf 'x-ratelimit-reset: %s\\r\\n' "$(($(date +%s) + 60))"
printf 'content-type: application/json\\r\\n'
printf '\\r\\n'
printf '{"sha":"%s","commit":{"message":"%s"}}' \\
  "$MOCK_MAIN_SHA" "$(padding="$(head -c 131072 /dev/zero | tr '\\0' 'x')"; printf '%s' "$padding")"
printf '\\n'
`,
    { mode: 0o755 }
  );
  const result = spawnSync(
    'bash',
    [join(root, '.github/scripts/resolve-main-sha.sh'), 'JovieInc/Jovie'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_TOKEN: 'test-token',
        MOCK_MAIN_SHA: sha,
        PATH: `${mockBin}:${process.env.PATH}`,
        RESOLVE_MAIN_RETRY_SECONDS: '0',
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), sha);
  assert.doesNotMatch(result.stderr, /Broken pipe/);
});
