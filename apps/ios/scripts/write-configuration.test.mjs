import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'write-configuration.sh'
);

function runScript(t, extraEnv = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'write-config-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const plistPath = path.join(root, 'Configuration.local.plist');
  execFileSync('bash', [scriptPath], {
    env: {
      ...process.env,
      TARGET_PLIST: plistPath,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
  return { plistPath, root };
}

// --- resilience test ---

test('succeeds even when python3 on PATH is broken', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'broken-python-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  // Fake python3 that exits non-zero to simulate a broken Homebrew install
  // (e.g. pyexpat/libexpat _XML_SetAllocTrackerActivationThreshold mismatch).
  const fakePython3 = path.join(root, 'python3');
  writeFileSync(
    fakePython3,
    '#!/usr/bin/env bash\necho "python3: broken" >&2\nexit 1\n'
  );
  chmodSync(fakePython3, 0o755);

  const plistPath = path.join(root, 'Configuration.local.plist');
  execFileSync('bash', [scriptPath], {
    env: {
      ...process.env,
      PATH: `${root}:${process.env.PATH}`, // broken python3 is first on PATH
      TARGET_PLIST: plistPath,
    },
    encoding: 'utf8',
  });

  const contents = readFileSync(plistPath, 'utf8');
  assert.match(contents, /<key>ApiBaseUrl<\/key>/);
  assert.doesNotMatch(contents, /<key>ClerkPublishableKey<\/key>/);
});

// --- correctness tests ---

test('writes all eight expected plist keys without a retired Clerk key', t => {
  const { plistPath } = runScript(t, {
    API_BASE_URL: 'https://api.jov.ie',
    WEB_BASE_URL: 'https://jov.ie',
    JOVIE_IOS_SENTRY_DSN: 'https://sentry.example.com/1',
    JOVIE_IOS_OBSERVABILITY_ENVIRONMENT: 'staging',
    JOVIE_IOS_OBSERVABILITY_INGEST_URL: 'https://ingest.example.com',
    JOVIE_IOS_OBSERVABILITY_INGEST_SECRET: 'secret-token',
    CLERK_REDIRECT_URL: 'ie.jov.jovie://callback',
    CLERK_CALLBACK_URL_SCHEME: 'ie.jov.jovie',
  });

  const contents = readFileSync(plistPath, 'utf8');
  for (const key of [
    'ApiBaseUrl',
    'WebBaseUrl',
    'SentryDsn',
    'ObservabilityEnvironment',
    'ObservabilityIngestUrl',
    'ObservabilityIngestSecret',
    'ClerkRedirectUrl',
    'ClerkCallbackUrlScheme',
  ]) {
    assert.match(
      contents,
      new RegExp(`<key>${key}</key>`),
      `missing key: ${key}`
    );
  }
  assert.match(contents, /<string>https:\/\/api\.jov\.ie<\/string>/);
  assert.match(contents, /<string>staging<\/string>/);
  assert.match(contents, /<string>ie\.jov\.jovie:\/\/callback<\/string>/);
  assert.doesNotMatch(contents, /<key>ClerkPublishableKey<\/key>/);
});

test('handles empty optional values without breaking the plist', t => {
  // Leave SENTRY_DSN and ingest fields unset; script defaults them to empty.
  const { plistPath } = runScript(t);

  const contents = readFileSync(plistPath, 'utf8');
  assert.match(contents, /^<\?xml/, 'not a valid XML plist');
  assert.match(contents, /<key>SentryDsn<\/key>/, 'SentryDsn key absent');
  assert.doesNotMatch(contents, /<key>ClerkPublishableKey<\/key>/);
});

test('produces a well-formed plist that plutil accepts', t => {
  const { plistPath } = runScript(t);
  // plutil -lint exits 0 on a valid plist
  execFileSync('/usr/bin/plutil', ['-lint', plistPath], { encoding: 'utf8' });
});
