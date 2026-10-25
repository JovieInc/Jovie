import assert from 'node:assert/strict';
import test from 'node:test';
import { sourcemapUploadPlan } from './upload-sourcemaps.mjs';

const identity = {
  channel: 'production',
  version: '26.10.16',
  sourceRevision: 'b'.repeat(40),
};
const env = {
  SENTRY_AUTH_TOKEN: 't',
  SENTRY_ORG: 'jovie',
  SENTRY_PROJECT: 'jovie-desktop',
};

test('skips without credentials or for local builds', () => {
  assert.equal(sourcemapUploadPlan({}, identity), null);
  assert.equal(
    sourcemapUploadPlan(env, { ...identity, channel: 'local' }),
    null
  );
});

test('release and dist match what the app reports', () => {
  const plan = sourcemapUploadPlan(env, identity);
  assert.equal(plan.release, 'jovie-desktop@26.10.16');
  assert.ok(plan.args.includes('--dist') && plan.args.includes('b'.repeat(12)));
  assert.ok(plan.args.includes('jovie-desktop@26.10.16'));
});
