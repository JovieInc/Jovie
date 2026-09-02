import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  assertStagingVersionTransition,
  expectedDesktopAssetNames,
  validateReleaseAssets,
} from './desktop-release-assets.mjs';
import {
  evaluateDesktopReleaseGuard,
  formatReleaseStampFailureDetails,
  readGitObjectContent,
} from './desktop-release-guard.mjs';
import { discoverVersionedManifests, planStamp } from './version-stamp.mjs';

const desktopRequire = createRequire(
  new URL('../apps/desktop/package.json', import.meta.url)
);
const desktopWorkflow = readFileSync(
  new URL('../.github/workflows/desktop-release.yml', import.meta.url),
  'utf8'
);
const desktopReleaseAssets = readFileSync(
  new URL('./desktop-release-assets.mjs', import.meta.url),
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

function hash(buffer, algorithm, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function desktopReleaseFixture(environment = 'production') {
  const version =
    environment === 'staging' ? '26.7.2-staging.17823456789.1' : '26.7.1';
  const releaseSha = 'a'.repeat(40);
  const prefix = environment === 'staging' ? 'Jovie-Staging' : 'Jovie';
  const channelFile =
    environment === 'staging' ? 'staging-mac.yml' : 'latest-mac.yml';
  const dmgName = `${prefix}-${version}-universal.dmg`;
  const zipName = `${prefix}-${version}-universal.zip`;
  const buffers = new Map([
    [dmgName, Buffer.from('signed dmg bytes')],
    [`${dmgName}.blockmap`, Buffer.from('dmg blockmap')],
    [zipName, Buffer.from('signed zip bytes')],
    [`${zipName}.blockmap`, Buffer.from('zip blockmap')],
  ]);
  const updater = [
    `version: ${version}`,
    'files:',
    `  - url: ${zipName}`,
    `    sha512: ${hash(buffers.get(zipName), 'sha512', 'base64')}`,
    `    size: ${buffers.get(zipName).length}`,
    `  - url: ${dmgName}`,
    `    sha512: ${hash(buffers.get(dmgName), 'sha512', 'base64')}`,
    `    size: ${buffers.get(dmgName).length}`,
    `path: ${zipName}`,
    `sha512: ${hash(buffers.get(zipName), 'sha512', 'base64')}`,
    'releaseDate: 2026-07-29T00:00:00.000Z',
    '',
  ].join('\n');
  buffers.set(channelFile, Buffer.from(updater));

  const release = {
    id: 123,
    tag_name: environment === 'staging' ? 'desktop-staging' : `v${version}`,
    target_commitish: releaseSha,
    name: version,
    draft: true,
    prerelease: environment === 'staging',
    published_at: null,
    assets: expectedDesktopAssetNames(version, environment).map(
      (name, index) => ({
        id: index + 1,
        name,
        state: 'uploaded',
        size: buffers.get(name).length,
        digest: `sha256:${hash(buffers.get(name), 'sha256', 'hex')}`,
        url: `https://api.github.com/assets/${index + 1}`,
      })
    ),
  };
  return { buffers, environment, release, releaseSha, version };
}

const releaseStampManifests = discoverVersionedManifests();
const deterministicReleaseStampFiles = [
  'CHANGELOG.md',
  'VERSION',
  'version.json',
  ...releaseStampManifests,
];
const releaseStampBaseVersion = '26.8.1';
const releaseStampNextVersion = '26.8.2';
const releaseStampDateISO = '2026-08-31';

function releaseManifest(path, version = releaseStampBaseVersion) {
  return `${JSON.stringify(
    {
      name: path === 'package.json' ? 'jovie-monorepo' : path.split('/')[1],
      version,
      private: true,
      scripts: { test: 'node --test' },
    },
    null,
    2
  )}\n`;
}

function releaseStampContents(headOverrides = {}) {
  const base = {
    'CHANGELOG.md':
      '# Changelog\n\n## [Unreleased]\n\n### Fixed\n- Guard repair.\n\n## [26.8.1] - 2026-08-30\n',
    VERSION: `${releaseStampBaseVersion}\n`,
    'version.json': `${JSON.stringify(
      { version: releaseStampBaseVersion },
      null,
      2
    )}\n`,
  };
  for (const manifest of releaseStampManifests) {
    base[manifest] = releaseManifest(manifest);
  }

  const head = { ...base };
  for (const write of planStamp({
    currentVersion: releaseStampBaseVersion,
    nextVersion: releaseStampNextVersion,
    manifests: releaseStampManifests.map(path => ({
      content: base[path],
      path,
    })),
    versionFile: base.VERSION,
    changelog: base['CHANGELOG.md'],
    dateISO: releaseStampDateISO,
  })) {
    head[write.path] = write.content;
  }

  return {
    getBaseContent: path => base[path],
    getHeadContent: path => ({ ...head, ...headOverrides })[path],
  };
}

test('desktop builder can parse Electron macOS property lists', () => {
  const electronBuilderPackage = desktopRequire.resolve(
    'electron-builder/package.json'
  );
  const electronBuilderRequire = createRequire(electronBuilderPackage);
  const appBuilderPackage = electronBuilderRequire.resolve(
    'app-builder-lib/package.json'
  );
  const appBuilderRequire = createRequire(appBuilderPackage);
  const plist = appBuilderRequire('plist');

  const parsed = plist.parse(
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<plist version="1.0"><dict>' +
      '<key>CFBundleName</key><string>Jovie</string>' +
      '</dict></plist>'
  );

  assert.deepEqual(parsed, { CFBundleName: 'Jovie' });
});

test('passes when no desktop files changed', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/web/app/page.tsx',
    'package.json',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.desktopFiles, []);
});

test('passes when desktop files defer release state to the post-land publisher', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    'apps/desktop/electron-builder.yml',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.prelandReleaseStateFiles, []);
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

test('still passes when a desktop test changes with release-impacting desktop code', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/scripts/desktop-icon-contract.test.mjs',
    'apps/desktop/src/main.ts',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.desktopFiles, ['apps/desktop/src/main.ts']);
});

test('fails when desktop changes include a pre-land changelog artifact', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    'CHANGELOG.md',
  ]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.prelandReleaseStateFiles, ['CHANGELOG.md']);
});

test('passes when desktop changes include explicit release workflow handling', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    '.github/workflows/desktop-release.yml',
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.prelandReleaseStateFiles, []);
});

test('fails when desktop changes include a pre-land version artifact', () => {
  const result = evaluateDesktopReleaseGuard([
    'apps/desktop/src/main.ts',
    'VERSION',
  ]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.prelandReleaseStateFiles, ['VERSION']);
  assert.deepEqual(formatReleaseStampFailureDetails(result), []);
});

test('passes explicit release deterministic fan-out with desktop package only', () => {
  const result = evaluateDesktopReleaseGuard({
    branch: 'release/2026-08-31',
    changedFiles: deterministicReleaseStampFiles,
    versionedManifests: releaseStampManifests,
    ...releaseStampContents(),
  });

  assert.equal(result.passed, true);
  assert.equal(result.releaseStampAuthorized, true);
  assert.deepEqual(result.releaseStampContentViolations, []);
  assert.deepEqual(result.desktopFiles, ['apps/desktop/package.json']);
  assert.deepEqual(result.releaseStampMissingFiles, []);
  assert.deepEqual(result.releaseStampExtraFiles, []);
});

test('preserves git object bytes for release-stamp content validation', () => {
  const version = readGitObjectContent('HEAD', 'VERSION');

  assert.equal(
    version,
    readFileSync(new URL('../VERSION', import.meta.url), 'utf8')
  );
  assert.equal(version?.endsWith('\n'), true);
});

test('fails deterministic fan-out on a feature branch', () => {
  const result = evaluateDesktopReleaseGuard({
    branch: 'tim/jov-5748-release-stamp',
    changedFiles: deterministicReleaseStampFiles,
    versionedManifests: releaseStampManifests,
    ...releaseStampContents(),
  });

  assert.equal(result.passed, false);
  assert.equal(result.releaseStampAuthorized, false);
  assert.deepEqual(result.desktopFiles, ['apps/desktop/package.json']);
  assert.deepEqual(result.prelandReleaseStateFiles, [
    'CHANGELOG.md',
    'VERSION',
  ]);
  assert.deepEqual(formatReleaseStampFailureDetails(result), []);
});

test('fails release fan-out bundled with desktop source changes', () => {
  const result = evaluateDesktopReleaseGuard({
    branch: 'release/2026-08-31',
    changedFiles: [
      ...deterministicReleaseStampFiles,
      'apps/desktop/src/main.ts',
    ],
    versionedManifests: releaseStampManifests,
    ...releaseStampContents(),
  });

  assert.equal(result.passed, false);
  assert.equal(result.releaseStampAuthorized, false);
  assert.deepEqual(result.desktopFiles, [
    'apps/desktop/package.json',
    'apps/desktop/src/main.ts',
  ]);
  assert.deepEqual(result.releaseStampExtraFiles, ['apps/desktop/src/main.ts']);
  assert.deepEqual(formatReleaseStampFailureDetails(result), [
    'Release-stamp extra files:',
    '- apps/desktop/src/main.ts',
  ]);
});

test('reports release fan-out missing files in guard diagnostics', () => {
  const result = evaluateDesktopReleaseGuard({
    branch: 'release/2026-08-31',
    changedFiles: deterministicReleaseStampFiles.filter(
      file => file !== 'version.json'
    ),
    versionedManifests: releaseStampManifests,
    ...releaseStampContents(),
  });

  assert.equal(result.passed, false);
  assert.equal(result.releaseStampAuthorized, false);
  assert.deepEqual(result.releaseStampMissingFiles, ['version.json']);
  assert.deepEqual(formatReleaseStampFailureDetails(result), [
    'Release-stamp missing files:',
    '- version.json',
  ]);
});

test('fails release fan-out when desktop package changes more than version', () => {
  const desktopPackage = JSON.parse(
    releaseStampContents().getHeadContent('apps/desktop/package.json')
  );
  desktopPackage.scripts.build = 'electron-builder';
  const result = evaluateDesktopReleaseGuard({
    branch: 'release/2026-08-31',
    changedFiles: deterministicReleaseStampFiles,
    versionedManifests: releaseStampManifests,
    ...releaseStampContents({
      'apps/desktop/package.json': `${JSON.stringify(
        desktopPackage,
        null,
        2
      )}\n`,
    }),
  });

  assert.equal(result.passed, false);
  assert.equal(result.releaseStampAuthorized, false);
  assert.deepEqual(result.releaseStampContentViolations, [
    'apps/desktop/package.json changed more than the version field',
  ]);
  assert.deepEqual(formatReleaseStampFailureDetails(result), [
    'Release-stamp content violations:',
    '- apps/desktop/package.json changed more than the version field',
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
    /Recovered exact asset-proven desktop publish/,
    /Verify exact published release assets/,
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

test('desktop staging publishes an exact signed prerelease and production stays separately proven', () => {
  const authorize = step(
    job(desktopWorkflow, 'authorize-release'),
    'Cross-prove exact production evidence'
  );
  const build = job(desktopWorkflow, 'build');
  const publish = step(build, 'Publish production desktop release');
  const stagingPublish = step(build, 'Publish staging desktop prerelease');
  const stagingVerify = step(build, 'Verify staging desktop artifact set');
  const stagingUpload = step(build, 'Upload staging desktop package');
  const marker = job(desktopWorkflow, 'record-production-publish');

  assertPatterns(authorize, [
    /actions\/workflows\/ci\.yml/,
    /\.name == "CI"/,
    /\.path == "\.github\/workflows\/ci\.yml"/,
    /\.head_sha == \$sha/,
    /\.conclusion == "success"/,
  ]);
  assertPatterns(build, [
    /needs: \[authorize-release\]/,
    /ref: \$\{\{ needs\.authorize-release\.outputs\.release_sha \}\}/,
    /package:staging/,
    /package:production/,
    /sync-version\.mjs[\s\S]*--staging-version/,
    /Validate rolling staging prerelease/,
    /Require staging signing and notarization credentials/,
    /desktop-release-assets\.mjs upload-and-publish/,
    /dist\/latest-mac\.yml/,
    /dist\/staging-mac\.yml/,
  ]);
  assertPatterns(publish, [
    /repos\/\$\{\{ github\.repository \}\}\/commits\/main/,
    /desktop-release-assets\.mjs upload-and-publish/,
    /--dist "apps\/desktop\/dist"/,
  ]);
  assertPatterns(stagingUpload, [
    /if: env\.ENVIRONMENT == 'staging'/,
    /desktop-staging-/,
    /staging-mac\.yml/,
    /retention-days: 7/,
  ]);
  assertPatterns(stagingPublish, [
    /commits\/main/,
    /desktop-release-assets\.mjs upload-and-publish/,
    /--environment staging/,
    /--version "\$\{\{ steps\.staging-version\.outputs\.version \}\}"/,
  ]);
  assertPatterns(stagingVerify, [
    /codesign --verify --deep --strict/,
    /spctl --assess --type execute/,
    /xcrun stapler validate/,
    /build-identity\.json/,
    /record\.sourceRevision === sha/,
    /--print-build-identity/,
    /app-update\.yml/,
    /provider:\[\[:space:\]\]\*generic/,
    /releases\/download\/desktop-staging/,
    /channel:\[\[:space:\]\]\*staging/,
  ]);
  assert.doesNotMatch(stagingUpload, /desktop-production-published|GH_TOKEN/);
  assert.ok(
    publish.indexOf('commits/main') <
      publish.indexOf('desktop-release-assets.mjs upload-and-publish')
  );
  assert.ok(
    build.indexOf('Prepare private production draft') <
      build.indexOf('Package production desktop app')
  );
  assert.ok(
    build.indexOf('Validate rolling staging prerelease') <
      build.indexOf('Package staging desktop app')
  );
  assert.doesNotMatch(build, /Upload production desktop publish marker/);
  assertPatterns(marker, [
    /needs: \[authorize-release, build\]/,
    /runs-on: ubuntu-latest/,
    /actions: read/,
    /contents: read/,
    /Verify exact published release assets/,
    /Cross-prove exact production publisher/,
    /publisherJobId/,
    /Upload production desktop publish marker/,
    /overwrite: true/,
    /retention-days: 90/,
  ]);
  assert.ok(
    marker.indexOf('Verify exact published release assets') <
      marker.indexOf('Cross-prove exact production publisher')
  );
  assert.doesNotMatch(marker, /contents: write|electron-builder publish/);
  assert.doesNotMatch(
    desktopWorkflow,
    /electron-builder publish|--publish always/
  );
  assert.match(desktopReleaseAssets, /releases\?per_page=100/);
});

test('desktop release proof rejects zero-asset and mismatched-digest releases', () => {
  const valid = desktopReleaseFixture();
  assert.doesNotThrow(() => validateReleaseAssets({ ...valid, draft: true }));

  const empty = desktopReleaseFixture();
  empty.release.assets = [];
  assert.throws(
    () => validateReleaseAssets({ ...empty, draft: true }),
    /exactly five/
  );

  const mismatched = desktopReleaseFixture();
  mismatched.release.assets[0].digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(
    () => validateReleaseAssets({ ...mismatched, draft: true }),
    /Server SHA-256/
  );
  const wrongTarget = desktopReleaseFixture();
  wrongTarget.release.target_commitish = 'b'.repeat(40);
  assert.throws(
    () => validateReleaseAssets({ ...wrongTarget, draft: true }),
    /authorized commit/
  );
});

test('staging release proof binds prerelease assets and channel metadata', () => {
  const valid = desktopReleaseFixture('staging');
  assert.doesNotThrow(() => validateReleaseAssets({ ...valid, draft: true }));

  const stableEnvelope = desktopReleaseFixture('staging');
  stableEnvelope.release.prerelease = false;
  assert.throws(
    () => validateReleaseAssets({ ...stableEnvelope, draft: true }),
    /prerelease state/
  );

  const wrongChannel = desktopReleaseFixture('staging');
  const manifest = wrongChannel.buffers.get('staging-mac.yml');
  wrongChannel.buffers.delete('staging-mac.yml');
  wrongChannel.buffers.set('latest-mac.yml', manifest);
  assert.throws(
    () => validateReleaseAssets({ ...wrongChannel, draft: true }),
    /Artifact bytes are missing for staging-mac\.yml/
  );
});

test('staging release versions advance beyond installed and current-feed versions', () => {
  const valid = {
    installedVersion: '26.8.1',
    version: '26.8.2-staging.17823456790.1',
  };
  assert.doesNotThrow(() =>
    assertStagingVersionTransition({
      ...valid,
      currentFeedVersion: '26.8.2-staging.17823456789.1',
    })
  );
  for (const [input, message] of [
    [
      {
        ...valid,
        currentFeedVersion: '26.8.2-staging.17823456790.1',
        version: '26.8.2-staging.17823456789.1',
      },
      /not newer than current feed/,
    ],
    [{ ...valid, version: '26.8.1-staging.17823456791.1' }, /next-patch/],
    [{ ...valid, version: '26.8.1+staging.17823456791.1' }, /valid prerelease/],
  ]) {
    assert.throws(() => assertStagingVersionTransition(input), message);
  }
});
