import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

// The actionlint toolchain builds from checksum-pinned upstream sources. Its queue
// patch is VENDORED (JOV-8492 follow-up, 2026-11-10): github.com's web .patch
// endpoint 429s for minutes on the runners' shared egress IPs (run 42871254633
// failed after eight consecutive 429s), so the script must never fetch it at run
// time — the vendored bytes are checksum-pinned instead.

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'run-actionlint.sh');
const script = readFileSync(scriptPath, 'utf8');

const queueCommit = /ACTIONLINT_QUEUE_COMMIT='([0-9a-f]{40})'/.exec(script)?.[1];
const pinnedPatchSha = /ACTIONLINT_QUEUE_PATCH_SHA256='([0-9a-f]{64})'/.exec(script)?.[1];

describe('run-actionlint vendored queue patch', () => {
  it('vendors the exact upstream patch next to the script, checksum-pinned', () => {
    assert.match(queueCommit ?? '', /^[0-9a-f]{40}$/);
    assert.match(pinnedPatchSha ?? '', /^[0-9a-f]{64}$/);
    const vendored = join(dirname(scriptPath), 'actionlint', `queue-${queueCommit}.patch`);
    const bytes = readFileSync(vendored);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      pinnedPatchSha,
      'the vendored patch must be byte-identical to the pinned upstream rendering'
    );
    assert.match(bytes.toString('utf8'), new RegExp(`^From ${queueCommit} `, 'm'));
  });

  it('never fetches the queue patch from github.com at run time', () => {
    assert.doesNotMatch(script, /github\.com\/rhysd\/actionlint\/commit\/.*\.patch/);
    assert.match(script, /VENDORED_QUEUE_PATCH/);
    // The checksum verification survives the vendoring.
    assert.match(script, /sha256sum --check --status \|\| fail 'vendored queue patch sha256 mismatch'/);
  });
});
