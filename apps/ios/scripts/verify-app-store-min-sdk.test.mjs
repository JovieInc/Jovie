// JOV-13089 - tests for the App Store minimum-SDK guard.
// Runs with the node built-in test runner, no dependencies:
//   node --test apps/ios/scripts/verify-app-store-min-sdk.test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const scriptPath = join(scriptDir, 'verify-app-store-min-sdk.mjs');
const configPath = join(scriptDir, '../config/app-store-min-sdk.json');

function runGuard(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
  });
}

function infoPlistWith(fields) {
  const dir = mkdtempSync(join(tmpdir(), 'min-sdk-guard-'));
  const plistPath = join(dir, 'Info.plist');
  const entries = Object.entries(fields)
    .map(([key, value]) => `<key>${key}</key><string>${value}</string>`)
    .join('');
  writeFileSync(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${entries}</dict></plist>
`
  );
  return plistPath;
}

const plist265 = () => infoPlistWith({ DTSDKName: 'iphoneos26.5' });
const plist27 = () =>
  infoPlistWith({ DTSDKName: 'iphoneos27.0', DTPlatformVersion: '27.0' });
const plistOld = () =>
  infoPlistWith({ DTSDKName: 'iphoneos18.2', DTPlatformVersion: '18.2' });

const CONFIG = ['--config', configPath];

// Below the minimum fails.
test('fails when the built SDK is below the current minimum', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plistOld(),
    '--today',
    '2026-11-19',
  ]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::error/);
  assert.match(result.stdout, /below the required minimum 26/);
});

// At the minimum passes.
test('passes when the built SDK is exactly at the current minimum', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    infoPlistWith({ DTSDKName: 'iphoneos26.0' }),
    '--today',
    '2026-04-28',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /::warning/);
  assert.match(result.stdout, /OK:/);
});

// At minimum today (mid-table) passes quietly.
test('passes on a normal day without a warning', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plist265(),
    '--today',
    '2026-11-19',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /::warning/);
});

// Inside the pre-deadline warn window: exit 0 + ::warning.
test('warns (exit 0) inside the pre-deadline window', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plist265(),
    '--today',
    '2027-02-15',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::warning/);
  assert.match(result.stdout, /minimum 27/);
  assert.match(result.stdout, /45 day\(s\) left/);
});

// Warn window boundary: exactly warnWindowDays out warns.
test('warns on the exact warn-window boundary day', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plist265(),
    '--today',
    '2027-01-31',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::warning/);
  assert.match(result.stdout, /60 day\(s\) left/);
});

// One day outside the warn window: quiet pass.
test('stays quiet one day outside the warn window', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plist265(),
    '--today',
    '2027-01-30',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /::warning/);
});

// Meeting the upcoming minimum silences the warn even inside the window.
test('no warning when the upcoming minimum is already met', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plist27(),
    '--today',
    '2027-02-15',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /::warning/);
});

// After the deadline, an older SDK hard-fails.
test('fails after the next requirement takes effect', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plist265(),
    '--today',
    '2027-04-01',
  ]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::error/);
  assert.match(result.stdout, /below the required minimum 27/);
});

// Warn window override is honored.
test('honors --warn-window-days override', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    plist265(),
    '--today',
    '2026-11-19',
    '--warn-window-days',
    '365',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::warning/);
});

// Missing plist keys fail closed.
test('fails closed when the plist has no SDK keys', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    infoPlistWith({ CFBundleIdentifier: 'com.jovie.app' }),
    '--today',
    '2026-11-19',
  ]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::error/);
  assert.match(result.stdout, /fail closed/);
});

// DTPlatformVersion alone satisfies the input.
test('accepts DTPlatformVersion alone', () => {
  const result = runGuard([
    ...CONFIG,
    '--info-plist',
    infoPlistWith({ DTPlatformVersion: '26.5' }),
    '--today',
    '2026-11-19',
  ]);
  assert.equal(result.status, 0, result.stderr);
});

// xcodebuild -showsdks fallback works.
test('accepts xcodebuild -showsdks output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'min-sdk-guard-'));
  const showsdksPath = join(dir, 'showsdks.txt');
  writeFileSync(
    showsdksPath,
    'iOS SDKs:\n\tiOS 26.5                       -sdk iphoneos26.5\n'
  );
  const result = runGuard([
    ...CONFIG,
    '--showsdks',
    showsdksPath,
    '--today',
    '2026-11-19',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /-showsdks DTSDKName=iphoneos26\.5/);
});

// Invalid config fails closed (every row must cite a source).
test('fails closed on a config row without a source URL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'min-sdk-guard-'));
  const badConfigPath = join(dir, 'bad-config.json');
  writeFileSync(
    badConfigPath,
    JSON.stringify({
      warnWindowDays: 60,
      rows: [{ effectiveDate: '2026-04-28', minSdkMajor: 26 }],
    })
  );
  const result = runGuard([
    '--config',
    badConfigPath,
    '--info-plist',
    plist265(),
    '--today',
    '2026-11-19',
  ]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /::error/);
  assert.match(result.stdout, /sourceUrl is required/);
});
