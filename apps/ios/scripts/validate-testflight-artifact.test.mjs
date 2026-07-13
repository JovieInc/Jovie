import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'validate-testflight-artifact.sh'
);

function makePlist(t, clerkPublishableKey) {
  const root = mkdtempSync(path.join(tmpdir(), 'testflight-artifact-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const plistPath = path.join(root, 'Configuration.local.plist');
  const payload = {
    ClerkPublishableKey: clerkPublishableKey,
    ApiBaseUrl: 'https://jov.ie',
    WebBaseUrl: 'https://jov.ie',
  };
  const entries =
    clerkPublishableKey === undefined
      ? ''
      : `<key>ClerkPublishableKey</key><string>${payload.ClerkPublishableKey}</string>`;
  writeFileSync(
    plistPath,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict>',
      entries,
      '<key>ApiBaseUrl</key><string>https://jov.ie</string>',
      '</dict></plist>',
      '',
    ].join('\n')
  );
  return plistPath;
}

function runValidator(plistPath) {
  return execFileSync('bash', [scriptPath], {
    env: { ...process.env, TESTFLIGHT_ARTIFACT_PLIST: plistPath },
    encoding: 'utf8',
  });
}

function runValidatorExpectingFailure(plistPath) {
  try {
    runValidator(plistPath);
    return { failed: false, output: '' };
  } catch (error) {
    return {
      failed: true,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

test('accepts a written artifact embedding a live Clerk key', t => {
  const plistPath = makePlist(t, 'pk_live_example');
  const output = runValidator(plistPath);
  assert.match(output, /Validated TestFlight configuration artifact/);
});

test('rejects a written artifact embedding the CI placeholder key', t => {
  const plistPath = makePlist(t, 'pk_test_ci_placeholder');
  const { failed, output } = runValidatorExpectingFailure(plistPath);
  assert.equal(failed, true);
  assert.match(output, /CI placeholder Clerk key/);
});

test('rejects a written artifact embedding a development pk_test key', t => {
  const plistPath = makePlist(t, 'pk_test_abc123');
  const { failed, output } = runValidatorExpectingFailure(plistPath);
  assert.equal(failed, true);
  assert.match(output, /development Clerk key/);
});

test('rejects a written artifact with a malformed key', t => {
  const plistPath = makePlist(t, 'not-a-clerk-key');
  const { failed, output } = runValidatorExpectingFailure(plistPath);
  assert.equal(failed, true);
  assert.match(output, /must start with pk_live_/);
});

test('rejects when the artifact has no ClerkPublishableKey value', t => {
  const plistPath = makePlist(t, undefined);
  const { failed, output } = runValidatorExpectingFailure(plistPath);
  assert.equal(failed, true);
  assert.match(output, /no ClerkPublishableKey value/);
});

test('rejects when the artifact does not exist at all', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'testflight-artifact-missing-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const missingPath = path.join(root, 'Configuration.local.plist');
  const { failed, output } = runValidatorExpectingFailure(missingPath);
  assert.equal(failed, true);
  assert.match(output, /Missing generated configuration artifact/);
});
