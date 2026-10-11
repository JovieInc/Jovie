import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  junitFailureCount,
  prepareQueueJUnit,
  readQueueJUnit,
} from './publish-queue-junit.mjs';

const sha = 'a'.repeat(40);
const clean =
  '<testsuites><testsuite><testcase name="clean"/></testsuite></testsuites>';
const failed =
  '<testsuites><testsuite><testcase name="failed"><failure>assertion</failure></testcase></testsuite></testsuites>';
function fixture(root) {
  const run = {
    id: 12,
    run_attempt: 2,
    workflow_id: 178737329,
    path: '.github/workflows/ci.yml',
    head_sha: sha,
    repository: { full_name: 'JovieInc/Jovie' },
    head_repository: { full_name: 'JovieInc/Jovie' },
    event: 'merge_group',
    status: 'completed',
    conclusion: 'failure',
    head_branch: 'gh-readonly-queue/main/pr-123-aaaa',
  };
  const artifact = {
    id: 4,
    name: 'unit-test-failure-12-2-0',
    expired: false,
    workflow_run: { id: 12, head_sha: sha },
  };
  const event = {
    repository: { full_name: 'JovieInc/Jovie' },
    workflow_run: { ...run },
  };
  const api = path =>
    path.includes('/artifacts?')
      ? { total_count: 1, artifacts: [artifact] }
      : run;
  return {
    run,
    artifact,
    event,
    input: {
      event,
      api,
      readArtifact: () => [clean, failed],
      outputRoot: join(root, 'reports'),
    },
  };
}
test('failure-containing exact attempt produces complete bound reports for the original group SHA', () => {
  const root = mkdtempSync(join(tmpdir(), 'queue-publisher-test-'));
  try {
    const f = fixture(root),
      result = prepareQueueJUnit(f.input);
    assert.equal(result.upload, true);
    assert.equal(result.headSha, sha);
    assert.equal(result.runId, 12);
    assert.equal(result.failures, 1);
    assert.equal(result.files.length, 2);
    assert.equal(readFileSync(result.files[0], 'utf8'), clean);
    assert.equal(readFileSync(result.files[1], 'utf8'), failed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('clean and missing reports never trigger a Codecov write or fabricate a failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'queue-publisher-test-'));
  try {
    const f = fixture(root);
    f.run.conclusion = 'success';
    f.input.readArtifact = () => [clean];
    assert.equal(prepareQueueJUnit(f.input).upload, false);
    assert.equal(existsSync(f.input.outputRoot), false);
    f.input.api = path =>
      path.includes('/artifacts?') ? { total_count: 0, artifacts: [] } : f.run;
    assert.equal(prepareQueueJUnit(f.input).upload, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('foreign, incomplete, stale, expired and unbound reports fail before output files exist', () => {
  const root = mkdtempSync(join(tmpdir(), 'queue-publisher-test-'));
  try {
    for (const mutate of [
      f => {
        f.event.repository.full_name = 'foreign/repo';
      },
      f => {
        f.run.run_attempt = 3;
      },
      f => {
        f.run.workflow_id = 1;
      },
      f => {
        f.run.head_sha = 'b'.repeat(40);
      },
      f => {
        f.run.event = 'pull_request';
      },
      f => {
        f.run.status = 'in_progress';
      },
      f => {
        f.run.conclusion = 'cancelled';
      },
      f => {
        f.run.head_repository.full_name = 'fork/repo';
      },
      f => {
        f.artifact.expired = true;
      },
      f => {
        f.artifact.workflow_run.head_sha = 'b'.repeat(40);
      },
      f => {
        f.input.readArtifact = () => [];
      },
      f => {
        f.input.readArtifact = () => ['malformed XML'];
      },
    ]) {
      const f = fixture(root);
      mutate(f);
      assert.throws(() => prepareQueueJUnit(f.input));
      assert.equal(existsSync(f.input.outputRoot), false);
    }
    const f = fixture(root),
      api = f.input.api;
    let reads = 0;
    f.input.api = path =>
      path.endsWith('/runs/12') && ++reads === 2
        ? { ...f.run, run_attempt: 3 }
        : api(path);
    assert.throws(() => prepareQueueJUnit(f.input), /attempt changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('XML parser counts elements rather than failure text or CDATA and rejects entities', () => {
  assert.equal(
    junitFailureCount(
      '<testsuite><testcase><system-out><![CDATA[<failure>not a failure</failure>]]></system-out></testcase></testsuite>'
    ),
    0
  );
  assert.equal(
    junitFailureCount(
      '<testsuite><testcase><flakyFailure>retry</flakyFailure></testcase></testsuite>'
    ),
    1
  );
  assert.throws(
    () =>
      junitFailureCount(
        '<!DOCTYPE testsuite [<!ENTITY secret SYSTEM "file:///etc/passwd">]><testsuite/>'
      ),
    /Unsafe/
  );
  assert.throws(
    () => junitFailureCount('x'.repeat(4 * 1024 * 1024 + 1)),
    /oversized/
  );
  assert.throws(() => junitFailureCount('<testsuite/>'));
});
test('real ZIP members stream as XML without artifact-controlled extraction', () => {
  const root = mkdtempSync(join(tmpdir(), 'queue-junit-zip-'));
  try {
    writeFileSync(join(root, 'test-report.1-14.junit.xml'), failed);
    const zip = join(root, 'reports.zip');
    execFileSync('zip', ['-q', zip, 'test-report.1-14.junit.xml'], {
      cwd: root,
    });
    assert.deepEqual(
      readQueueJUnit({ id: 4 }, () => readFileSync(zip)),
      [failed]
    );
    writeFileSync(join(root, 'unsafe.txt'), 'source');
    execFileSync('zip', ['-q', zip, 'unsafe.txt'], { cwd: root });
    assert.throws(
      () => readQueueJUnit({ id: 4 }, () => readFileSync(zip)),
      /Unsafe JUnit archive/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test('uncommissioned publication CLI stops before any remote access', () => {
  const result = spawnSync(
    process.execPath,
    ['.github/scripts/publish-queue-junit.mjs'],
    {
      encoding: 'utf8',
      env: { ...process.env, QUARANTINE_AUTO_HEAL_ENABLED: 'false' },
    }
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /publication is disabled/);
  assert.equal(result.stdout, '');
});
