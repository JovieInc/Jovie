import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
    /TRIGGER_WORKFLOW_ID/,
    /TRIGGER_RUN_PATH" = "\.github\/workflows\/production-controller\.yml"/,
    /\.name == "Production Controller"/,
    /actions\/workflows\/\$TRIGGER_WORKFLOW_ID/,
    /\^Production Controller .* from CI .* attempt/,
    /runs\/\$TRIGGER_RUN_ID\/attempts\/\$TRIGGER_RUN_ATTEMPT\/jobs\?per_page=100/,
    /\.name == "Production Verified"/,
    /\[ "\$verified_count" = "1" \]/,
    /production-generation-verified-\$expected_sha/,
    /repos\/\$REPOSITORY\/commits\/main/,
  ]);
  assert.equal(proof.match(/' <<<"\$jobs_json"\)"$/gm)?.length, 1);
  assert.doesNotMatch(proof, /TRIGGER_RUN_NAME/);
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
    /\.environment == "production"/,
    /\.publisherAttempt/,
    /\.publisherJobId/,
    /actions\/workflows\/\$workflow_id/,
    /\.name == "desktop-release"/,
    /all\(\.artifacts\[\];[\s\S]*\.name == "desktop-production-published"/,
    /publish_marker_presence_count="\$\(jq '\.artifacts \| length'/,
    /publish_marker_presence_count.*-gt 0/s,
    /status=completed&per_page=25/,
    /Recovered exact desktop publish/,
    /desktop-release\.yml\/runs\?branch=main&event=push&status=success&per_page=100/,
    /No proven desktop baseline exists/,
    /already_released=true/,
  ]);
  assertPatterns(select, [
    /No proven publish baseline; comparing the exact prior main generation/,
    /git merge-base --is-ancestor/,
    /git diff --name-status --find-renames/,
  ]);
  assert.doesNotMatch(proof, /desktop-staging-/);
  assert.doesNotMatch(select, /apps\/desktop/);
  assert.doesNotMatch(select, /desktop-release\.yml/);
  assert.doesNotMatch(proof, /gh api[\s\S]{0,160}\|\| continue/);
  const failClosedIndex = proof.indexOf(
    'if [ "$publish_marker_presence_count" -gt 0 ]'
  );
  assert.ok(
    failClosedIndex > proof.indexOf('recovery_candidates='),
    'marker history must allow exact publisher recovery first'
  );
  assert.ok(
    failClosedIndex < proof.indexOf('legacy_runs_json='),
    'unproved marker history must fail before legacy or bootstrap fallback'
  );
});

test('desktop stable marker listing distinguishes empty from unprovable history', () => {
  const proof = step(
    job(desktopWorkflow, 'authorize-release'),
    'Cross-prove exact production evidence'
  );
  const validationStart = proof.indexOf(
    "          jq -e '\n",
    proof.indexOf('publish_markers=')
  );
  const validationEnd = proof.indexOf("\n          ' \\\n", validationStart);
  assert.ok(validationStart >= 0 && validationEnd > validationStart);
  const validationProgram = proof.slice(
    validationStart + "          jq -e '\n".length,
    validationEnd
  );
  const marker = {
    id: 1,
    name: 'desktop-production-published',
    expired: true,
    created_at: '2026-07-19T00:00:00Z',
    workflow_run: { id: 2 },
  };

  assert.doesNotThrow(() =>
    execFileSync('jq', ['-e', validationProgram], {
      input: JSON.stringify({ artifacts: [marker] }),
    })
  );
  assert.throws(() =>
    execFileSync('jq', ['-e', validationProgram], {
      input: JSON.stringify({
        artifacts: [{ ...marker, name: 'unexpected-marker' }],
      }),
      stdio: ['pipe', 'ignore', 'ignore'],
    })
  );
  assert.equal(
    execFileSync('jq', ['-r', '.artifacts | length'], {
      encoding: 'utf8',
      input: JSON.stringify({ artifacts: [marker] }),
    }).trim(),
    '1'
  );
});

test('desktop recovery ignores legacy push titles and selects new run-name evidence', () => {
  const proof = step(
    job(desktopWorkflow, 'authorize-release'),
    'Cross-prove exact production evidence'
  );
  const recovery = proof.slice(proof.indexOf('recovery_candidates='));
  const jqProgram = recovery.match(
    /jq -r '\n([\s\S]*?)\n\s+' <<<"\$\(jq -c '\.workflow_runs'/
  )?.[1];
  assert.ok(jqProgram, 'missing embedded recovery selector');
  const oldSha = 'a'.repeat(40);
  const newSha = 'b'.repeat(40);
  const output = execFileSync('jq', ['-r', jqProgram], {
    encoding: 'utf8',
    input: JSON.stringify([
      {
        id: 1,
        run_attempt: 1,
        head_sha: oldSha,
        event: 'push',
        display_title: 'fix: old desktop release',
        created_at: '2026-07-18T00:00:00Z',
      },
      {
        id: 2,
        run_attempt: 1,
        head_sha: newSha,
        event: 'workflow_run',
        display_title: `Desktop release ${newSha}`,
        created_at: '2026-07-19T00:00:00Z',
      },
    ]),
  });
  assert.equal(output.trim(), `2\t1\t${newSha}`);
});

test('automatic desktop publishing selects VERSION changes only', () => {
  const select = step(
    job(desktopWorkflow, 'authorize-release'),
    'Select desktop-relevant production generation'
  );
  const paths = select
    .match(/release_paths=\(\n([\s\S]*?)\n\s+\)/)?.[1]
    ?.trim()
    .split(/\s+/);
  assert.deepEqual(paths, ['VERSION']);
  assert.equal(paths?.includes('.github/workflows/desktop-release.yml'), false);
  assert.equal(paths?.includes('VERSION'), true);
});

test('desktop staging is a bounded artifact and production is separately proven', () => {
  const build = job(desktopWorkflow, 'build');
  const publish = step(build, 'Publish production desktop release');
  const stagingUpload = step(build, 'Upload staging desktop package');
  const marker = job(desktopWorkflow, 'record-production-publish');

  assertPatterns(build, [
    /needs: \[authorize-release\]/,
    /ref: \$\{\{ needs\.authorize-release\.outputs\.release_sha \}\}/,
    /package:staging/,
    /package:production/,
    /electron-builder publish/,
    /dist\/latest-mac\.yml/,
  ]);
  assertPatterns(publish, [
    /repos\/\$\{\{ github\.repository \}\}\/commits\/main/,
    /electron-builder publish/,
  ]);
  assertPatterns(stagingUpload, [
    /if: env\.ENVIRONMENT == 'staging'/,
    /desktop-staging-/,
    /retention-days: 7/,
  ]);
  // publish is null in electron-builder.staging.yml, so staging produces no
  // auto-update metadata (staging-mac.yml) and must not try to upload it.
  assert.doesNotMatch(stagingUpload, /staging-mac\.yml/);
  assert.doesNotMatch(stagingUpload, /desktop-production-published|GH_TOKEN/);
  assert.ok(
    publish.indexOf('commits/main') <
      publish.indexOf('electron-builder publish')
  );
  assert.doesNotMatch(build, /Upload production desktop publish marker/);
  assertPatterns(marker, [
    /needs: \[authorize-release, build\]/,
    /runs-on: ubuntu-latest/,
    /actions: read/,
    /contents: read/,
    /Cross-prove exact production publisher/,
    /publisherJobId/,
    /Upload production desktop publish marker/,
    /overwrite: true/,
    /retention-days: 90/,
  ]);
  assert.doesNotMatch(marker, /contents: write|electron-builder publish/);
  assert.doesNotMatch(desktopWorkflow, /--publish always/);
});

test('desktop publisher passes the release version as an equals-form option', () => {
  const publish = step(
    job(desktopWorkflow, 'build'),
    'Publish production desktop release'
  );

  assert.match(publish, /--version="\$release_version"/);
  assert.doesNotMatch(publish, /--version\s+"\$release_version"/);
});
