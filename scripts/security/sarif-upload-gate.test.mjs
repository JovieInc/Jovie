#!/usr/bin/env node
import assert from 'node:assert/strict';
// Contract tests for scripts/security/sarif-upload-gate.mjs (JOV-11801).
//
// The gate is the only thing standing between a quota-exhausted push and a
// red main: an empty shared Actions installation bucket defers the osv SARIF
// upload visibly, every state with room defers nothing, and malformed input
// fails closed so a broken gate never waves an upload through. These tests
// pin all three directions plus the CLI output contract.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  gateQuota,
  MIN_REMAINING_FOR_UPLOAD,
  main,
  parseQuota,
  renderGate,
} from './sarif-upload-gate.mjs';

const scriptPath = fileURLToPath(
  new URL('./sarif-upload-gate.mjs', import.meta.url)
);

test('an empty bucket defers', () => {
  const decision = gateQuota({ remaining: 0, reset: 100, limit: 1000 });
  assert.equal(decision.defer, true);
  assert.match(decision.reason, /remaining=0 of 1000/);
});

test('a bucket too close to empty defers before the upload can race it dry', () => {
  // The upload action spends several REST calls and sibling jobs drain the
  // shared bucket every second, so the floor sits above zero.
  assert.equal(
    gateQuota({
      remaining: MIN_REMAINING_FOR_UPLOAD - 1,
      reset: 100,
      limit: 1000,
    }).defer,
    true
  );
  assert.equal(
    gateQuota({ remaining: MIN_REMAINING_FOR_UPLOAD, reset: 100, limit: 1000 })
      .defer,
    false
  );
});

test('a bucket with room defers nothing', () => {
  const decision = gateQuota({ remaining: 500, reset: 100, limit: 1000 });
  assert.equal(decision.defer, false);
});

test('parseQuota accepts the core resource and rejects malformed input', () => {
  assert.deepEqual(
    parseQuota('{"remaining":56,"reset":1794649396,"limit":60}'),
    { remaining: 56, reset: 1794649396, limit: 60 }
  );
  assert.deepEqual(parseQuota('{"remaining":56,"reset":1794649396}'), {
    remaining: 56,
    reset: 1794649396,
    limit: null,
  });
  assert.throws(() => parseQuota('not json'));
  assert.throws(() => parseQuota('{"remaining":"x","reset":5}'));
  assert.throws(() => parseQuota('[]'));
});

test('renderGate keeps the deferral visible and the pass-through quiet', () => {
  const deferred = renderGate({
    label: 'osv',
    quota: { remaining: 0, reset: 1794649396, limit: 1000 },
  });
  assert.equal(deferred.code, 0);
  assert.equal(deferred.output, 'defer=true');
  assert.match(deferred.warning ?? '', /github-quota-deferred/);
  assert.match(deferred.warning ?? '', /osv SARIF upload deferred/);
  assert.match(deferred.warning ?? '', /not a verdict on the code/);
  assert.ok(deferred.summaryLine);

  const passthrough = renderGate({
    label: 'osv',
    quota: { remaining: 400, reset: 1794649396, limit: 1000 },
  });
  assert.equal(passthrough.code, 0);
  assert.equal(passthrough.output, 'defer=false');
  assert.equal(passthrough.warning, null);
  assert.equal(passthrough.summaryLine, null);
});

test('main writes defer=true to the step output and warns', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sarif-gate-'));
  const outputFile = join(dir, 'output.txt');
  const summaryFile = join(dir, 'summary.md');
  const chunks = [];
  const code = main(['--label', 'osv'], {
    env: {
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
    },
    readStdin: () => '{"remaining":0,"reset":1794649396,"limit":1000}',
    stdout: { write: chunk => chunks.push(chunk) },
    stderr: { write: chunk => chunks.push(chunk) },
  });
  assert.equal(code, 0);
  assert.equal(readFileSync(outputFile, 'utf8'), 'defer=true\n');
  assert.match(readFileSync(summaryFile, 'utf8'), /github-quota-deferred/);
  assert.match(chunks.join(''), /github-quota-deferred/);
  rmSync(dir, { recursive: true, force: true });
});

test('main writes defer=false and stays quiet when the bucket has room', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sarif-gate-'));
  const outputFile = join(dir, 'output.txt');
  const chunks = [];
  const code = main([], {
    env: { GITHUB_OUTPUT: outputFile },
    readStdin: () => '{"remaining":400,"reset":1794649396,"limit":1000}',
    stdout: { write: chunk => chunks.push(chunk) },
    stderr: { write: chunk => chunks.push(chunk) },
  });
  assert.equal(code, 0);
  assert.equal(readFileSync(outputFile, 'utf8'), 'defer=false\n');
  assert.equal(chunks.join(''), '');
  rmSync(dir, { recursive: true, force: true });
});

test('main prints the decision to stdout when no step output is declared', () => {
  const chunks = [];
  const code = main([], {
    env: {},
    readStdin: () => '{"remaining":400,"reset":1794649396,"limit":1000}',
    stdout: { write: chunk => chunks.push(chunk) },
    stderr: { write: chunk => chunks.push(chunk) },
  });
  assert.equal(code, 0);
  assert.equal(chunks.join(''), 'defer=false\n');
});

test('main fails closed on malformed quota input', () => {
  const chunks = [];
  const code = main([], {
    env: { GITHUB_OUTPUT: '/dev/null' },
    readStdin: () => 'oops',
    stdout: { write: chunk => chunks.push(chunk) },
    stderr: { write: chunk => chunks.push(chunk) },
  });
  assert.equal(code, 1);
  assert.match(chunks.join(''), /sarif-upload-gate:/);
});

test('the CLI exits 0 with defer=true on an empty bucket', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sarif-gate-'));
  const outputFile = join(dir, 'output.txt');
  const run = spawnSync(process.execPath, [scriptPath, '--label', 'osv'], {
    input: '{"remaining":0,"reset":1794649396,"limit":1000}',
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: outputFile },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(outputFile, 'utf8'), 'defer=true\n');
  assert.match(run.stdout, /github-quota-deferred/);
  rmSync(dir, { recursive: true, force: true });
});

test('the CLI exits 1 on malformed stdin and rejects unknown arguments', () => {
  const malformed = spawnSync(process.execPath, [scriptPath], {
    input: 'oops',
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: '/dev/null' },
  });
  assert.equal(malformed.status, 1);
  const unknown = spawnSync(process.execPath, [scriptPath, '--wat'], {
    input: '{"remaining":40,"reset":5}',
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: '/dev/null' },
  });
  assert.equal(unknown.status, 1);
});
