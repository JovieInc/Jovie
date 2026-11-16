import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { test } from 'node:test';

const SCRIPT = resolve(import.meta.dirname, 'staging-identity-read.sh');
const GOOD_IDENTITY = JSON.stringify({
  commitSha: 'ce07c2cdcf5e80bf2ed59389b8186e193937bda3',
  deploymentId: 'dpl_exactStage',
  environment: 'preview',
});
const MALFORMED_IDENTITY = JSON.stringify({
  commitSha: 'staging',
  deploymentId: 'dpl_exactStage',
  environment: 'preview',
});
const PRODUCTION_IDENTITY = JSON.stringify({
  commitSha: 'ce07c2cdcf5e80bf2ed59389b8186e193937bda3',
  deploymentId: 'dpl_exactStage',
  environment: 'production',
});

// Sequence file: one JSON body per line; curl serves them in order and then
// keeps repeating the last line. A line of exactly `FAIL` makes curl exit 7.
function harness({ sequence, attempts = '4', backoff = '0' }) {
  const root = mkdtempSync(join(tmpdir(), 'staging-identity-read-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(root, 'sequence'), `${sequence.join('\n')}\n`);
  writeFileSync(
    join(bin, 'curl'),
    [
      '#!/usr/bin/env node',
      'const { readFileSync, writeFileSync } = require("node:fs");',
      'const lines = readFileSync(process.env.SEQUENCE_FILE, "utf8").trim().split("\\n");',
      'const n = Number(readFileSync(process.env.CURL_COUNT, "utf8") || "0");',
      'writeFileSync(process.env.CURL_COUNT, String(n + 1));',
      'const line = lines[Math.min(n, lines.length - 1)];',
      'if (line === "FAIL") process.exit(7);',
      'process.stdout.write(line);',
      '',
    ].join('\n')
  );
  writeFileSync(join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(bin, 'curl'), 0o755);
  chmodSync(join(bin, 'sleep'), 0o755);
  writeFileSync(join(root, 'curl-count'), '0');
  const result = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      SEQUENCE_FILE: join(root, 'sequence'),
      CURL_COUNT: join(root, 'curl-count'),
      STAGING_IDENTITY_ATTEMPTS: attempts,
      STAGING_IDENTITY_BACKOFF_SECONDS: backoff,
    },
  });
  return {
    result,
    reads: Number(readFileSync(join(root, 'curl-count'), 'utf8')),
  };
}

test('emits the well-formed identity on the first read without retrying', () => {
  const { result, reads } = harness({ sequence: [GOOD_IDENTITY] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, GOOD_IDENTITY);
  assert.equal(reads, 1);
  assert.equal(result.stderr, '');
});

test('retries a transient malformed body and succeeds on a later read', () => {
  const { result, reads } = harness({
    sequence: [MALFORMED_IDENTITY, PRODUCTION_IDENTITY, GOOD_IDENTITY],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, GOOD_IDENTITY);
  assert.equal(reads, 3);
  assert.match(result.stderr, /attempt 1\/4 unusable \(malformed shape\)/);
  assert.match(result.stderr, /attempt 2\/4 unusable \(malformed shape\)/);
  assert.doesNotMatch(result.stderr, /stayed unusable/);
  // The unusable bodies themselves never reach the log.
  assert.doesNotMatch(result.stderr, /dpl_exactStage/);
});

test('classifies a non-preview environment as malformed rather than accepting it', () => {
  const { result, reads } = harness({
    sequence: [PRODUCTION_IDENTITY, GOOD_IDENTITY],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(reads, 2);
});

test('retries a transport failure and succeeds on a later read', () => {
  const { result, reads } = harness({ sequence: ['FAIL', GOOD_IDENTITY] });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, GOOD_IDENTITY);
  assert.equal(reads, 2);
  assert.match(result.stderr, /attempt 1\/4 unusable \(transport failure\)/);
});

test('fails closed on a persistently malformed identity', () => {
  const { result, reads } = harness({
    sequence: [MALFORMED_IDENTITY],
    attempts: '3',
  });
  assert.equal(result.status, 1);
  assert.equal(reads, 3);
  assert.match(
    result.stderr,
    /stayed unusable \(malformed shape\) after 3\/3 attempts/
  );
  assert.equal(result.stdout, '');
});

test('fails closed on persistent transport failures, propagating the curl exit code', () => {
  const { result, reads } = harness({ sequence: ['FAIL'], attempts: '3' });
  assert.equal(result.status, 7);
  assert.equal(reads, 3);
  assert.match(
    result.stderr,
    /stayed unusable \(transport failure\) after 3\/3 attempts/
  );
});

test('rejects a non-positive attempt budget instead of looping forever', () => {
  const { result, reads } = harness({
    sequence: [GOOD_IDENTITY],
    attempts: '0',
  });
  assert.equal(result.status, 1);
  assert.equal(reads, 0);
  assert.match(result.stderr, /positive STAGING_IDENTITY_ATTEMPTS/);
});
