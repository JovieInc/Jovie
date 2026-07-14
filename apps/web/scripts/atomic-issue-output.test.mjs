import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { writeIssueOutputAtomic } from './atomic-issue-output.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'jovie-issue-output-'));
  mkdirSync(join(root, 'apps/web'), { recursive: true });
  return root;
}

test('creates the owned directory and atomically replaces only the stable file', () => {
  const root = fixture();
  try {
    const outputPath = writeIssueOutputAtomic(
      'sonar-issues-latest.json',
      '[{"id":"first"}]',
      { root }
    );
    writeIssueOutputAtomic('sonar-issues-latest.json', '[{"id":"second"}]', {
      root,
    });

    assert.equal(
      outputPath,
      join(realpathSync(root), 'apps/web/.issues/sonar-issues-latest.json')
    );
    assert.equal(readFileSync(outputPath, 'utf8'), '[{"id":"second"}]');
    assert.deepEqual(readdirSync(join(root, 'apps/web/.issues')), [
      'sonar-issues-latest.json',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses unowned names and symlinked output roots', () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'jovie-issue-output-outside-'));
  try {
    assert.throws(
      () =>
        writeIssueOutputAtomic('sonar-issues-2026-07-13.json', '[]', {
          root,
        }),
      /unsupported issue output file/
    );

    symlinkSync(outside, join(root, 'apps/web/.issues'));
    assert.throws(
      () => writeIssueOutputAtomic('sonar-issues-latest.json', '[]', { root }),
      /must be a real directory/
    );
    assert.equal(existsSync(join(outside, 'sonar-issues-latest.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('cleans its temp file when the final rename fails', () => {
  const root = fixture();
  const outputDir = join(root, 'apps/web/.issues');
  const outputPath = join(outputDir, 'batches-latest.json');
  try {
    mkdirSync(outputDir);
    mkdirSync(outputPath);
    writeFileSync(join(outputPath, 'keep.txt'), 'existing target');

    assert.throws(
      () => writeIssueOutputAtomic('batches-latest.json', '[]', { root }),
      /EISDIR|ENOTEMPTY|EPERM/
    );
    assert.deepEqual(readdirSync(outputDir), ['batches-latest.json']);
    assert.equal(
      readFileSync(join(outputPath, 'keep.txt'), 'utf8'),
      'existing target'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('all issue producers write only stable filenames', () => {
  for (const file of [
    'apps/web/scripts/fetch-sonar-issues.sh',
    'apps/web/scripts/fetch-sentry-issues.mjs',
    'apps/web/scripts/analyze-issues.mjs',
  ]) {
    const source = readFileSync(resolve(file), 'utf8');
    assert.doesNotMatch(source, /issues-\$TIMESTAMP|issues-\$\{timestamp\}/);
    assert.doesNotMatch(source, /batches-\$\{timestamp\}/);
    assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\).*replace/);
  }
});
