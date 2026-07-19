import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateDesktopReleaseGuard } from './desktop-release-guard.mjs';

const desktopWorkflow = readFileSync(
  new URL('../.github/workflows/desktop-release.yml', import.meta.url),
  'utf8'
);

function getBlock(source, marker, nextPattern) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing workflow block: ${marker.trim()}`);
  const remainder = source.slice(start + marker.length);
  const offset = remainder.search(nextPattern);
  return source.slice(
    start,
    offset < 0 ? undefined : start + marker.length + offset
  );
}

function job(workflow, jobKey) {
  return getBlock(workflow, `  ${jobKey}:`, /\n  [\w-]+:/);
}

function step(workflow, stepName) {
  return getBlock(
    workflow,
    `      - name: ${stepName}`,
    /\n      - name: |\n  [\w-]+:/
  );
}

function assertPatterns(source, patterns) {
  patterns.forEach(pattern => assert.match(source, pattern));
}

test('passes when no desktop files changed', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/web/app/page.tsx',
    'package.json',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.desktopFiles, []);
});

test('fails when desktop files changed without a release trigger', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    'apps/desktop/electron-builder.yml',
  ]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.releaseHandlingFiles, []);
});

test('passes when only desktop contract tests changed', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/scripts/desktop-icon-contract.test.mjs',
    'apps/web/app/page.tsx',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.desktopFiles, []);
});

test('passes when only desktop smoke harnesses changed', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/scripts/smoke-native-auth.mjs',
    'apps/web/app/page.tsx',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.desktopFiles, []);
});

test('still fails when a desktop test changes with release-impacting desktop code', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/scripts/desktop-icon-contract.test.mjs',
    'apps/desktop/src/main.ts',
  ]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.desktopFiles, ['apps/desktop/src/main.ts']);
});

test('passes when desktop changes include unreleased changelog notes', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    'CHANGELOG.md',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.releaseHandlingFiles, ['CHANGELOG.md']);
});

test('passes when desktop changes include explicit release workflow handling', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    '.github/workflows/desktop-release.yml',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.releaseHandlingFiles, [
    '.github/workflows/desktop-release.yml',
  ]);
});

test('desktop publishing follows verified production instead of raw main pushes', () => {
  assertPatterns(desktopWorkflow, [
    /workflows: \[Production Controller\]/,
    /^  workflow_dispatch:\n/m,
    /group: desktop-release-publisher/,
    /cancel-in-progress: false/,
  ]);
  assert.doesNotMatch(desktopWorkflow, /^  push:\n/m);
});

test('desktop authorizer cross-proves exact Production Verified evidence', () => {
  const authorize = job(desktopWorkflow, 'authorize-release');
  const header = authorize.slice(0, authorize.indexOf('    steps:'));
  const proof = step(authorize, 'Cross-prove exact production evidence');

  assertPatterns(header, [
    /runs-on: ubuntu-latest/,
    /actions: read/,
    /contents: read/,
  ]);
  assertPatterns(proof, [
    /TRIGGER_RUN_NAME" = "Production Controller"/,
    /TRIGGER_RUN_PATH" = "\.github\/workflows\/production-controller\.yml"/,
    /\.name == "Production Controller"/,
    /runs\/\$TRIGGER_RUN_ID\/attempts\/\$TRIGGER_RUN_ATTEMPT\/jobs\?per_page=100/,
    /\.name == "Production Verified"/,
    /\[ "\$verified_count" = "1" \]/,
    /production-generation-verified-\$expected_sha/,
    /repos\/\$REPOSITORY\/commits\/main/,
  ]);
  assert.doesNotMatch(header, /contents: write/);
  assert.doesNotMatch(authorize, /secrets\./);
  assert.ok(
    proof.lastIndexOf('if [ "$EVENT_NAME" = "workflow_dispatch" ]') >
      proof.indexOf('if [ "$production_proven" != "true" ]')
  );
});

test('desktop dedup cross-proves an actual-publish-only marker', () => {
  const authorize = job(desktopWorkflow, 'authorize-release');
  const proof = step(authorize, 'Cross-prove exact production evidence');
  const select = step(
    authorize,
    'Select desktop-relevant production generation'
  );

  assertPatterns(proof, [
    /actions\/artifacts\?name=desktop-production-published&per_page=100/,
    /runs\/\$run_id\/attempts\/\$run_attempt\/jobs\?per_page=100/,
    /\.name == "Publish production desktop release"/,
    /\.name == "Upload production desktop publish marker"/,
    /\.environment == "production"/,
    /\.runAttempt == \$attempt/,
    /desktop-release\.yml\/runs\?branch=main&event=push&status=success&per_page=100/,
    /No proven desktop baseline exists/,
    /already_released=true/,
  ]);
  assertPatterns(select, [
    /First verified desktop release selected/,
    /git merge-base --is-ancestor/,
    /\.github\/workflows\/desktop-release\.yml/,
    /git diff --name-status --find-renames/,
  ]);
  assert.doesNotMatch(proof, /desktop-staging-/);
  assert.doesNotMatch(select, /apps\/desktop/);
});

test('desktop staging is a bounded artifact and production is separately proven', () => {
  const build = job(desktopWorkflow, 'build');
  const stagingUpload = step(build, 'Upload staging desktop package');

  assertPatterns(build, [
    /needs: \[authorize-release\]/,
    /ref: \$\{\{ needs\.authorize-release\.outputs\.release_sha \}\}/,
    /package:staging/,
    /package:production/,
    /repos\/\$\{\{ github\.repository \}\}\/commits\/main/,
    /electron-builder publish/,
    /dist\/latest-mac\.yml/,
    /desktop-production-published\.json/,
    /name: desktop-production-published/,
    /retention-days: 90/,
  ]);
  assertPatterns(stagingUpload, [
    /if: env\.ENVIRONMENT == 'staging'/,
    /desktop-staging-/,
    /staging-mac\.yml/,
    /retention-days: 7/,
  ]);
  assert.doesNotMatch(stagingUpload, /desktop-production-published|GH_TOKEN/);
  assert.ok(
    build.indexOf(
      '- name: Revalidate exact current main before production publish'
    ) < build.lastIndexOf('- name: Publish production desktop release')
  );
  assert.ok(
    build.lastIndexOf('- name: Publish production desktop release') <
      build.lastIndexOf('- name: Upload production desktop publish marker')
  );
  assert.doesNotMatch(desktopWorkflow, /--publish always/);
});
