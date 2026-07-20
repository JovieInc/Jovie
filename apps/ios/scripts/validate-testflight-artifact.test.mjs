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

function makePlist(
  t,
  {
    apiBaseUrl = 'https://jov.ie',
    webBaseUrl = 'https://jov.ie',
    clerkPublishableKey,
  } = {}
) {
  const root = mkdtempSync(path.join(tmpdir(), 'testflight-artifact-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const plistPath = path.join(root, 'Configuration.local.plist');
  const legacyEntry = clerkPublishableKey
    ? `<key>ClerkPublishableKey</key><string>${clerkPublishableKey}</string>`
    : '';
  writeFileSync(
    plistPath,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0"><dict>',
      legacyEntry,
      `<key>ApiBaseUrl</key><string>${apiBaseUrl}</string>`,
      `<key>WebBaseUrl</key><string>${webBaseUrl}</string>`,
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

test('accepts canonical production endpoints without a Clerk client key', t => {
  const output = runValidator(makePlist(t));
  assert.match(output, /Validated TestFlight configuration artifact/);
});

test('rejects a non-production API endpoint', t => {
  const plistPath = makePlist(t, { apiBaseUrl: 'http://localhost:3100' });
  const { failed, output } = runValidatorExpectingFailure(plistPath);
  assert.equal(failed, true);
  assert.match(output, /non-production ApiBaseUrl/);
});

test('rejects a non-production web endpoint', t => {
  const plistPath = makePlist(t, { webBaseUrl: 'https://staging.jov.ie' });
  const { failed, output } = runValidatorExpectingFailure(plistPath);
  assert.equal(failed, true);
  assert.match(output, /non-production WebBaseUrl/);
});

test('rejects an artifact that still embeds the retired Clerk key', t => {
  const plistPath = makePlist(t, {
    clerkPublishableKey: 'pk_live_legacy',
  });
  const { failed, output } = runValidatorExpectingFailure(plistPath);
  assert.equal(failed, true);
  assert.match(output, /retired ClerkPublishableKey/);
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
