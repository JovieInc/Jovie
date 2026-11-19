import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// The actionlint toolchain builds from checksum-pinned upstream sources. Its queue
// patch is VENDORED (JOV-8492 follow-up, 2026-11-10): github.com's web .patch
// endpoint 429s for minutes on the runners' shared egress IPs (run 42871254633
// failed after eight consecutive 429s), so the script must never fetch it at run
// time — the vendored bytes are checksum-pinned instead.

const scriptPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'run-actionlint.sh'
);
const script = readFileSync(scriptPath, 'utf8');
const { load } = createRequire(import.meta.url)('js-yaml');

const queueCommit = /ACTIONLINT_QUEUE_COMMIT='([0-9a-f]{40})'/.exec(
  script
)?.[1];
const pinnedPatchSha = /ACTIONLINT_QUEUE_PATCH_SHA256='([0-9a-f]{64})'/.exec(
  script
)?.[1];

describe('run-actionlint vendored queue patch', () => {
  it('vendors the exact upstream patch next to the script, checksum-pinned', () => {
    assert.match(queueCommit ?? '', /^[0-9a-f]{40}$/);
    assert.match(pinnedPatchSha ?? '', /^[0-9a-f]{64}$/);
    const vendored = join(
      dirname(scriptPath),
      'actionlint',
      `queue-${queueCommit}.patch`
    );
    const bytes = readFileSync(vendored);
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      pinnedPatchSha,
      'the vendored patch must be byte-identical to the pinned upstream rendering'
    );
    assert.match(
      bytes.toString('utf8'),
      new RegExp(`^From ${queueCommit} `, 'm')
    );
  });

  it('never fetches the queue patch from github.com at run time', () => {
    assert.doesNotMatch(
      script,
      /github\.com\/rhysd\/actionlint\/commit\/.*\.patch/
    );
    assert.match(script, /VENDORED_QUEUE_PATCH/);
    // The checksum verification survives the vendoring.
    assert.match(
      script,
      /sha_ok \"\$VENDORED_QUEUE_PATCH\" \"\$ACTIONLINT_QUEUE_PATCH_SHA256\" \|\| fail 'vendored queue patch sha256 mismatch'/
    );
  });
});

describe('actionlint downloads', () => {
  it('restores both pinned artifacts and Go modules on every automated or manual caller', () => {
    const root = join(dirname(scriptPath), '../..');
    for (const [workflow, job] of [
      ['ci.yml', 'ci-fast-remaining'],
      ['source-validation.yml', 'deterministic'],
      ['actionlint.yml', 'actionlint'],
      ['tsc-cache-warm.yml', 'warm'],
    ]) {
      const steps = load(
        readFileSync(join(root, '.github/workflows', workflow), 'utf8')
      ).jobs[job].steps;
      const artifacts = steps.find(
        step => step.name === 'Restore pinned actionlint downloads'
      );
      const modules = steps.find(
        step => step.name === 'Restore verified actionlint Go modules'
      );
      assert.match(artifacts.uses, /^actions\/cache\/restore@[a-f0-9]{40}$/);
      assert.match(modules.uses, /^actions\/cache\/restore@[a-f0-9]{40}$/);
      assert.match(modules.with.path, /go\/pkg\/mod/);
      assert.match(modules.with.key, /1\.26\.10.*run-actionlint\.sh/);
      if (workflow !== 'tsc-cache-warm.yml')
        assert.ok(
          !steps.some(
            step =>
              /^actions\/cache\/save@/.test(step.uses ?? '') &&
              /go\/pkg\/mod/.test(step.with?.path ?? '')
          )
        );
    }
  });
  it('checks restored modules against the pinned upstream go.sum before compiling', () => {
    assert.match(
      script,
      /go mod verify \|\| fail 'cached Go module checksum mismatch'/
    );
    assert.ok(script.indexOf('go mod verify') < script.indexOf('  go test'));
    assert.match(script, /GOTOOLCHAIN=local GOWORK=off/);
    assert.match(script, /-mod=readonly/);
  });
  it('fills missing Go caches even when artifact downloads already hit', () => {
    const root = join(dirname(scriptPath), '../..');
    const steps = load(
      readFileSync(join(root, '.github/workflows/tsc-cache-warm.yml'), 'utf8')
    ).jobs.warm.steps;
    const fill = steps.find(
      step => step.name === 'Fill pinned actionlint downloads'
    );
    const save = steps.find(
      step => step.name === 'Save verified actionlint Go modules'
    );
    assert.match(
      fill.if,
      /steps\.pinned-downloads\.outputs\.cache-hit != 'true' \|\| steps\.actionlint-go\.outputs\.cache-hit != 'true'/
    );
    assert.match(save.if, /steps\.pinned-fill\.outputs\.filled == 'true'/);
  });
});
