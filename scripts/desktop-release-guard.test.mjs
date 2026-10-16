import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertCommitDescendantCompare,
  assertMainlineAncestorCompare,
  assertStagingVersionTransition,
  expectedDesktopAssetNames,
  fetchRecoverableProductionDraft,
  fetchRecoverableStagingDraft,
  prepare,
  RELEASE_ASSET_READ_ATTEMPTS,
  RELEASE_ASSET_READ_MAX_WAIT_MS,
  releaseMetadataUpdate,
  selectRecoverableProductionDraft,
  selectRecoverableStagingDraft,
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
const { notarizeReleaseDmg } = desktopRequire(
  './scripts/notarize-release-dmg.cjs'
);
const desktopProductionBuilder = readFileSync(
  new URL('../apps/desktop/electron-builder.yml', import.meta.url),
  'utf8'
);
const desktopStagingBuilder = readFileSync(
  new URL('../apps/desktop/electron-builder.staging.yml', import.meta.url),
  'utf8'
);
const desktopWorkflow = readFileSync(
  new URL('../.github/workflows/desktop-release.yml', import.meta.url),
  'utf8'
);
const productionMarkerRecoveryWorkflow = readFileSync(
  new URL(
    '../.github/workflows/production-marker-recovery.yml',
    import.meta.url
  ),
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

function shellStepBody(workflow, stepName) {
  const block = step(workflow, stepName);
  const marker = '        run: |\n';
  const start = block.indexOf(marker);
  assert.notEqual(start, -1, `Missing shell body: ${stepName}`);
  return block
    .slice(start + marker.length)
    .split('\n')
    .map(line => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

function assertPatterns(source, patterns) {
  patterns.forEach(pattern => assert.match(source, pattern));
}

function dedentShell(source) {
  const indentation = Math.min(
    ...source
      .split('\n')
      .filter(line => line.trim())
      .map(line => line.match(/^\s*/)[0].length)
  );
  return source
    .split('\n')
    .map(line => line.slice(indentation))
    .join('\n');
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

test('release DMG finalization signs, notarizes, staples, and refreshes updater metadata', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'jovie-release-dmg-'));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const dmg = join(dir, 'Jovie-26.9.0-universal.dmg');
  const blockmap = `${dmg}.blockmap`;
  await writeFile(dmg, Buffer.from('pre-staple-dmg'));
  await writeFile(blockmap, Buffer.from('stale-blockmap'));
  const event = {
    file: dmg,
    updateInfo: {
      sha512: hash(Buffer.from('pre-staple-dmg'), 'sha512', 'base64'),
      size: Buffer.byteLength('pre-staple-dmg'),
    },
  };
  const calls = [];

  await notarizeReleaseDmg(event, {
    environment: {
      APPLE_API_ISSUER: 'issuer',
      APPLE_API_KEY: '/tmp/private-key.p8',
      APPLE_API_KEY_ID: 'key-id',
      JOVIE_MAC_SIGNING_IDENTITY: 'developer-id-hash',
      JOVIE_RELEASE_DMG: 'true',
    },
    executeCodesign: async args => {
      calls.push(['codesign', ...args]);
      return { stdout: '' };
    },
    executeXcrun: async args => {
      calls.push(['xcrun', ...args]);
      if (args[0] === 'notarytool') {
        return {
          stdout: JSON.stringify({ id: 'submission', status: 'Accepted' }),
        };
      }
      if (args[1] === 'staple') await appendFile(dmg, '-ticket');
      return { stdout: '' };
    },
  });

  const finalBytes = await readFile(dmg);
  assert.deepEqual(calls, [
    ['codesign', '--force', '--timestamp', '--sign', 'developer-id-hash', dmg],
    ['codesign', '--verify', '--verbose=2', dmg],
    [
      'xcrun',
      'notarytool',
      'submit',
      dmg,
      '--key',
      '/tmp/private-key.p8',
      '--key-id',
      'key-id',
      '--issuer',
      'issuer',
      '--wait',
      '--timeout',
      '20m',
      '--output-format',
      'json',
    ],
    ['xcrun', 'stapler', 'staple', dmg],
    ['xcrun', 'stapler', 'validate', dmg],
  ]);
  assert.equal(event.updateInfo.size, finalBytes.length);
  assert.equal(event.updateInfo.sha512, hash(finalBytes, 'sha512', 'base64'));
  assert.notEqual(await readFile(blockmap, 'utf8'), 'stale-blockmap');
});

test('release DMG finalization fails closed before publishing incoherent artifacts', async t => {
  const dmg = '/tmp/Jovie-Staging-26.8.3-staging.1.1-universal.dmg';
  const accepted = async () => ({
    stdout: JSON.stringify({ id: 'submission', status: 'Accepted' }),
  });
  const codesignAccepted = async () => ({ stdout: '' });
  const environment = {
    APPLE_API_ISSUER: 'issuer',
    APPLE_API_KEY: '/tmp/private-key.p8',
    APPLE_API_KEY_ID: 'key-id',
    JOVIE_MAC_SIGNING_IDENTITY: 'developer-id-hash',
    JOVIE_RELEASE_DMG: 'true',
  };

  await t.test('ignores non-DMG artifacts', async () => {
    await notarizeReleaseDmg(
      { file: `${dmg}.blockmap`, updateInfo: {} },
      {
        buildBlockMap: () => assert.fail('must not build'),
        environment: {},
        executeCodesign: () => assert.fail('must not execute'),
        executeXcrun: () => assert.fail('must not execute'),
      }
    );
  });
  await t.test('keeps ordinary CI packaging credential-free', async () => {
    const updateInfo = { sha512: 'unchanged', size: 1 };
    await notarizeReleaseDmg(
      { file: dmg, updateInfo },
      {
        buildBlockMap: () => assert.fail('must not build'),
        environment: {},
        executeCodesign: () => assert.fail('must not execute'),
        executeXcrun: () => assert.fail('must not execute'),
      }
    );
    assert.deepEqual(updateInfo, { sha512: 'unchanged', size: 1 });
  });
  await t.test('requires builder update metadata', async () => {
    await assert.rejects(
      notarizeReleaseDmg(
        { file: dmg },
        { buildBlockMap: assert.fail, environment, executeXcrun: accepted }
      ),
      /update metadata is missing/
    );
  });
  await t.test('requires every notarization credential', async () => {
    for (const [name, missingEnvironment] of [
      ['issuer', { ...environment, APPLE_API_ISSUER: '' }],
      ['signingIdentity', { ...environment, JOVIE_MAC_SIGNING_IDENTITY: '' }],
    ]) {
      await assert.rejects(
        notarizeReleaseDmg(
          { file: dmg, updateInfo: {} },
          {
            buildBlockMap: assert.fail,
            environment: missingEnvironment,
            executeCodesign: assert.fail,
            executeXcrun: accepted,
          }
        ),
        new RegExp(`credential is missing: ${name}`)
      );
    }
  });
  await t.test('requires an accepted structured Apple response', async () => {
    for (const stdout of [
      'not-json',
      JSON.stringify({ id: 'submission', status: 'Invalid' }),
      JSON.stringify({ id: '', status: 'Accepted' }),
    ]) {
      await assert.rejects(
        notarizeReleaseDmg(
          { file: dmg, updateInfo: {} },
          {
            buildBlockMap: assert.fail,
            environment,
            executeCodesign: codesignAccepted,
            executeXcrun: async () => ({ stdout }),
          }
        ),
        /not valid JSON|did not accept/
      );
    }
  });
  await t.test('stops before notarization when DMG signing fails', async () => {
    await assert.rejects(
      notarizeReleaseDmg(
        { file: dmg, updateInfo: {} },
        {
          buildBlockMap: assert.fail,
          environment,
          executeCodesign: async () => {
            throw new Error('signing failed');
          },
          executeXcrun: assert.fail,
        }
      ),
      /signing failed/
    );
  });
  await t.test('requires final metadata for the stapled bytes', async () => {
    await assert.rejects(
      notarizeReleaseDmg(
        { file: dmg, updateInfo: {} },
        {
          buildBlockMap: async () => ({ sha512: '', size: 0 }),
          environment,
          executeCodesign: codesignAccepted,
          executeXcrun: accepted,
        }
      ),
      /update metadata is malformed/
    );
  });
});

test('release validation rejects a DMG mutated after updater metadata creation', () => {
  const fixture = desktopReleaseFixture('staging');
  const dmgName = fixture.release.assets.find(asset =>
    asset.name.endsWith('.dmg')
  ).name;
  const finalDmg = Buffer.concat([
    fixture.buffers.get(dmgName),
    Buffer.from('-stapled-ticket'),
  ]);
  fixture.buffers.set(dmgName, finalDmg);
  const asset = fixture.release.assets.find(item => item.name === dmgName);
  asset.size = finalDmg.length;
  asset.digest = `sha256:${hash(finalDmg, 'sha256', 'hex')}`;

  assert.throws(
    () => validateReleaseAssets({ ...fixture, draft: true }),
    /Updater size does not match/
  );
});

test('staging release metadata update restores the canonical rolling tag', () => {
  const version = '26.8.3-staging.34302621597.1';
  const releaseSha = 'a'.repeat(40);

  assert.deepEqual(
    releaseMetadataUpdate({
      environment: 'staging',
      releaseSha,
      version,
    }),
    {
      name: version,
      prerelease: true,
      tag_name: 'desktop-staging',
      target_commitish: releaseSha,
    }
  );
});

function recoverableStagingDraft(overrides = {}) {
  return {
    assets: [],
    draft: true,
    id: 385137639,
    name: '26.8.3-staging.34302621597.1',
    prerelease: true,
    published_at: null,
    tag_name: 'untagged-84c451c95b383b6899b7',
    target_commitish: 'a'.repeat(40),
    ...overrides,
  };
}

const productionRecoveryInput = {
  releaseSha: '43414c7da0e53f1b47cda7e562c2b43de4c386f7',
  version: '26.10.0',
};

function recoverableProductionDraft(overrides = {}) {
  return {
    ...recoverableStagingDraft(),
    id: 401449487,
    name: productionRecoveryInput.version,
    prerelease: false,
    tag_name: 'untagged-4342acff1e28ec4b6d16',
    target_commitish: productionRecoveryInput.releaseSha,
    ...overrides,
  };
}

test('production recovery selects the exact authorized source and preserves older drafts', () => {
  const candidate = recoverableProductionDraft();
  const others = [
    { id: 401429954, target_commitish: '85315d'.padEnd(40, '0') },
    { target_commitish: productionRecoveryInput.releaseSha.slice(0, 7) },
    { target_commitish: 'main' },
    { name: '26.9.16' },
    { tag_name: 'v26.10.0' },
    { tag_name: 'untagged-invalid' },
    { tag_name: null },
  ].map(recoverableProductionDraft);
  const before = structuredClone(others);
  assert.equal(
    selectRecoverableProductionDraft(
      [...others, candidate],
      productionRecoveryInput
    ),
    candidate
  );
  assert.deepEqual(others, before);
  assert.equal(
    selectRecoverableProductionDraft(others, productionRecoveryInput),
    null
  );
  assert.equal(
    selectRecoverableProductionDraft([null], productionRecoveryInput),
    null
  );
});

test('production recovery rejects multiple exact authorized placeholders', () => {
  assert.throws(
    () =>
      selectRecoverableProductionDraft(
        [
          recoverableProductionDraft(),
          recoverableProductionDraft({ id: 401449488 }),
        ],
        productionRecoveryInput
      ),
    /Multiple recoverable production drafts/
  );
});

test('production recovery rejects unsafe draft envelopes and assets', () => {
  for (const unsafe of [
    { id: 0 },
    { id: '401449487' },
    { id: null },
    { draft: false },
    { draft: undefined },
    { prerelease: true },
    { prerelease: undefined },
    { published_at: '2026-10-02T00:00:00Z' },
    { published_at: undefined },
    { assets: null },
    { assets: [{ id: 1 }] },
  ]) {
    assert.throws(
      () =>
        selectRecoverableProductionDraft(
          [recoverableProductionDraft(unsafe)],
          productionRecoveryInput
        ),
      /Recoverable production/
    );
  }
});

test('production recovery rejects malformed authorization and inventory', () => {
  for (const input of [
    { ...productionRecoveryInput, releaseSha: 'main' },
    { ...productionRecoveryInput, releaseSha: '43414c7' },
    { ...productionRecoveryInput, version: '26.10.0-staging.1.1' },
  ]) {
    assert.throws(
      () => selectRecoverableProductionDraft([], input),
      /malformed|semver/
    );
  }
  assert.throws(
    () => selectRecoverableProductionDraft(null, productionRecoveryInput),
    /malformed/
  );
});

test('production recovery scans every inventory page before selecting', async () => {
  const candidate = recoverableProductionDraft();
  const pages = [
    [candidate],
    [recoverableProductionDraft({ id: 401449488 })],
    [],
  ];
  const requested = [];
  await assert.rejects(
    fetchRecoverableProductionDraft(
      async path => {
        requested.push(path);
        return pages.shift();
      },
      productionRecoveryInput,
      { pageSize: 1 }
    ),
    /Multiple recoverable production drafts/
  );
  assert.deepEqual(requested, [
    '?per_page=1&page=1',
    '?per_page=1&page=2',
    '?per_page=1&page=3',
  ]);
  assert.deepEqual(
    await fetchRecoverableProductionDraft(
      async () => [candidate],
      productionRecoveryInput
    ),
    candidate
  );
  assert.equal(
    await fetchRecoverableProductionDraft(
      async () => [],
      productionRecoveryInput
    ),
    null
  );
});

test('production recovery fails closed on incomplete or malformed paginated inventories', async () => {
  await assert.rejects(
    fetchRecoverableProductionDraft(
      async () => [recoverableProductionDraft()],
      productionRecoveryInput,
      { maxPages: 1, pageSize: 1 }
    ),
    /inventory exceeds the 1-page safety bound/
  );
  await assert.rejects(
    fetchRecoverableProductionDraft(async () => null, productionRecoveryInput),
    /malformed/
  );
  await assert.rejects(
    fetchRecoverableProductionDraft(
      async () => [null, null],
      productionRecoveryInput,
      { pageSize: 1 }
    ),
    /exceeds the requested size/
  );
  await assert.rejects(
    fetchRecoverableProductionDraft(null, productionRecoveryInput),
    /request is missing/
  );
  for (const options of [{ maxPages: 0 }, { pageSize: 0 }, { pageSize: 101 }]) {
    await assert.rejects(
      fetchRecoverableProductionDraft(
        async () => [],
        productionRecoveryInput,
        options
      ),
      /invalid/
    );
  }
});

test('selects only a unique private empty staging-shaped orphan draft', () => {
  const candidate = recoverableStagingDraft();
  assert.equal(
    selectRecoverableStagingDraft([
      { ...candidate, id: 1, name: 'unrelated', tag_name: 'v1.0.0' },
      candidate,
    ]),
    candidate
  );
  assert.equal(selectRecoverableStagingDraft([]), null);
});

test('rejects ambiguous or unsafe staging orphan drafts', () => {
  const candidate = recoverableStagingDraft();
  assert.throws(
    () =>
      selectRecoverableStagingDraft([
        candidate,
        recoverableStagingDraft({ id: 385137640 }),
      ]),
    /Multiple recoverable staging drafts/
  );
  assert.throws(
    () =>
      selectRecoverableStagingDraft([
        recoverableStagingDraft({ assets: [{ id: 1 }] }),
      ]),
    /must be empty/
  );
  for (const unsafe of [
    { draft: false, published_at: '2026-09-09T00:00:00Z' },
    { prerelease: false },
    { published_at: '2026-09-09T00:00:00Z' },
  ]) {
    assert.throws(
      () => selectRecoverableStagingDraft([recoverableStagingDraft(unsafe)]),
      /private prerelease draft/
    );
  }
  assert.throws(
    () =>
      selectRecoverableStagingDraft([
        recoverableStagingDraft({
          name: '26.8.3-staging.not-a-run.1',
        }),
      ]),
    /version is malformed/
  );
});

test('rejects staging orphan ambiguity beyond the first release page', async () => {
  const first = recoverableStagingDraft();
  const second = recoverableStagingDraft({ id: 385137640 });
  const unrelated = index => ({
    id: index,
    name: `release-${index}`,
    tag_name: `v1.0.${index}`,
  });
  const pages = [
    [first, ...Array.from({ length: 99 }, (_, index) => unrelated(index + 1))],
    [second],
  ];
  const requested = [];

  await assert.rejects(
    fetchRecoverableStagingDraft(
      async path => {
        requested.push(path);
        const page = Number(new URLSearchParams(path.slice(1)).get('page'));
        return pages[page - 1] || [];
      },
      { maxPages: 3 }
    ),
    /Multiple recoverable staging drafts/
  );
  assert.deepEqual(requested, ['?per_page=100&page=1', '?per_page=100&page=2']);
});

test('fails closed when the bounded release inventory never completes', async () => {
  await assert.rejects(
    fetchRecoverableStagingDraft(
      async () =>
        Array.from({ length: 100 }, (_, index) => ({
          id: index + 1,
          name: `release-${index}`,
          tag_name: `v1.0.${index}`,
        })),
      { maxPages: 2 }
    ),
    /inventory exceeds the 2-page safety bound/
  );
});

test('prepare repairs an orphan staging draft before validating it', async () => {
  const version = '26.8.3-staging.34302621597.1';
  const releaseSha = 'b'.repeat(40);
  const orphan = recoverableStagingDraft();
  const repaired = {
    ...orphan,
    name: version,
    tag_name: 'desktop-staging',
    target_commitish: releaseSha,
  };
  const calls = [];
  const client = {
    recoverableStagingDraft: async () => {
      calls.push('recover');
      return orphan;
    },
    releaseById: async id => {
      calls.push(`read:${id}`);
      return repaired;
    },
    releaseOrDraftByTag: async () => null,
    updateReleaseMetadata: async metadata => {
      calls.push({ update: metadata });
      return repaired;
    },
  };

  await prepare({
    client,
    environment: 'staging',
    installedVersion: '26.8.2',
    releaseSha,
    version,
  });

  assert.deepEqual(calls, [
    'recover',
    {
      update: {
        environment: 'staging',
        releaseId: orphan.id,
        releaseSha,
        version,
      },
    },
    `read:${orphan.id}`,
  ]);
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
    /group: desktop-release-publisher-\$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/,
    /cancel-in-progress: false/,
    /A superseded observer that exits before publish does not own the SHA/,
    /--max-wait-seconds 600 --attempts 4/,
  ]);
  assert.equal(RELEASE_ASSET_READ_ATTEMPTS, 4);
  assert.equal(RELEASE_ASSET_READ_MAX_WAIT_MS, 600_000);
  assert.doesNotMatch(desktopWorkflow, /^  push:\n/m);
});

test('marker recovery wakes a selector-bound desktop reconciliation', () => {
  assertPatterns(desktopWorkflow, [
    /force_rebuild:/,
    /MANUAL_FORCE_REBUILD: \$\{\{ inputs\.force_rebuild \}\}/,
    /"\$MANUAL_FORCE_REBUILD" = "true"/,
  ]);
  assertPatterns(productionMarkerRecoveryWorkflow, [
    /gh workflow run desktop-release\.yml --ref main/,
    /-f environment=production/,
    /-f force_rebuild=false/,
  ]);
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
    /\.conclusion == "skipped"/,
    /\[ "\$\{verified_skipped:-0\}" = "1" \]/,
    /controller yielded the release lease/,
    /production-generation-verified-\$expected_sha/,
    /\$RUNNER_TEMP\/resolve-main-sha\.sh/,
    /\$RUNNER_TEMP\/gh-api-hold\.sh/,
  ]);
  assert.equal(proof.match(/' <<<"\$jobs_json"\)"$/gm)?.length, 2);
  assert.doesNotMatch(proof, /TRIGGER_RUN_NAME/);
  assert.doesNotMatch(header, /contents: write/);
  assert.doesNotMatch(authorize, /secrets\./);
  assert.ok(
    proof.lastIndexOf('if [ "$EVENT_NAME" = "workflow_dispatch" ]') >
      proof.indexOf('if [ "$production_proven" != "true" ]')
  );
});

test('desktop authorizer retries transient GitHub API failures', async t => {
  const proof = shellStepBody(
    desktopWorkflow,
    'Cross-prove exact production evidence'
  );
  const helperStart = proof.indexOf('gh() {');
  const helperEnd = proof.indexOf('\n\nif [ "$EVENT_NAME"', helperStart);
  assert.ok(
    helperStart >= 0 && helperEnd > helperStart,
    'missing bounded GitHub API retry helper'
  );
  const helper = proof.slice(helperStart, helperEnd);
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-gh-retry-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  await copyFile(
    new URL('../.github/scripts/gh-api-hold.sh', import.meta.url),
    join(root, 'gh-api-hold.sh')
  );
  const mockBin = join(root, 'bin');
  const counter = join(root, 'attempts');
  await mkdir(mockBin);
  await writeFile(
    join(mockBin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
count=0
if [ -f "$MOCK_GH_COUNTER" ]; then read -r count < "$MOCK_GH_COUNTER"; fi
count=$((count + 1))
printf '%s\n' "$count" > "$MOCK_GH_COUNTER"
if [ "$count" -le "$MOCK_GH_FAILURES" ]; then
  echo 'gh: Server Error (HTTP 502)' >&2
  exit 1
fi
printf '%s\n' '{"ok":true}'
`,
    { mode: 0o755 }
  );

  const run = failures =>
    spawnSync(
      'bash',
      ['-c', `set -euo pipefail\n${helper}\ngh api repos/JovieInc/Jovie`],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_API_RETRY_SECONDS: '0',
          MOCK_GH_COUNTER: counter,
          MOCK_GH_FAILURES: String(failures),
          PATH: `${mockBin}:${process.env.PATH}`,
          RUNNER_TEMP: root,
        },
      }
    );

  const recovered = run(1);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(recovered.stdout.trim(), '{"ok":true}');
  assert.equal((await readFile(counter, 'utf8')).trim(), '2');
  assert.match(recovered.stderr, /HTTP 502.*retrying/s);

  await writeFile(counter, '0\n');
  const exhausted = run(3);
  assert.equal(exhausted.status, 1);
  assert.equal((await readFile(counter, 'utf8')).trim(), '3');
  assert.match(exhausted.stderr, /HTTP 502/);
});

test('desktop authorizer defers when the installation reset is outside the budget', async t => {
  const proof = shellStepBody(
    desktopWorkflow,
    'Cross-prove exact production evidence'
  );
  const helperStart = proof.indexOf('gh() {');
  const helperEnd = proof.indexOf('\n\nif [ "$EVENT_NAME"', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helper = proof.slice(helperStart, helperEnd);
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-quota-defer-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  await copyFile(
    new URL('../.github/scripts/gh-api-hold.sh', import.meta.url),
    join(root, 'gh-api-hold.sh')
  );
  const mockBin = join(root, 'bin');
  const output = join(root, 'github-output');
  const summary = join(root, 'step-summary');
  const deferredSha = 'd'.repeat(40);
  const resetEpoch = Math.floor(Date.now() / 1000) + 10_000;
  const resetIso = new Date(resetEpoch * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  const sentence = `Installation quota resets at ${resetIso}. Deferring desktop publication of ${deferredSha} to the next reconciliation. No release was authorized.`;
  await mkdir(mockBin);
  await writeFile(output, 'authorized=true\nrelease_sha=already-set\n');
  await writeFile(summary, '');
  await writeFile(
    join(mockBin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
endpoint=""
for arg in "$@"; do
  case "$arg" in
    repos/*|rate_limit) endpoint="$arg" ;;
  esac
done
if [ "$endpoint" = rate_limit ]; then
  if [ "\${MOCK_RESET:-}" = missing ]; then
    exit 0
  fi
  printf '%s\\n' "$MOCK_RESET"
  exit 0
fi
echo "$MOCK_ERROR" >&2
exit 1
`,
    { mode: 0o755 }
  );
  const run = async (script, env) => {
    await rm(join(root, 'desktop-authorize-quota-defer'), { force: true });
    await rm(join(root, 'desktop-authorize-quota-reset'), { force: true });
    await writeFile(summary, '');
    return spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_API_HOLD_BUDGET_SECONDS: '240',
        GH_API_RETRY_SECONDS: '0',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        MOCK_ERROR: 'gh: API rate limit exceeded for installation. (HTTP 403)',
        MOCK_RESET: String(resetEpoch),
        PATH: `${mockBin}:${process.env.PATH}`,
        RUNNER_TEMP: root,
        ...env,
      },
    });
  };
  const directScript = `set -euo pipefail\n${helper}\nrelease_sha=${deferredSha}\ngh api repos/JovieInc/Jovie/actions/runs/1`;
  const substitutedScript = `set -euo pipefail\n${helper}\nrelease_sha=${deferredSha}\nout="$(gh api repos/JovieInc/Jovie/actions/runs/1)"\necho SHOULD_NOT_RUN\nprintf '%s' "$out"\n`;

  const deferred = await run(directScript);
  assert.equal(deferred.status, 0, deferred.stderr);
  assert.match(deferred.stderr, /outside the 240s budget/);
  assert.match(deferred.stderr, /Not passing/);
  assert.ok(
    deferred.stdout.includes(`::warning::${sentence}`),
    deferred.stdout
  );
  assert.equal((await readFile(summary, 'utf8')).trim(), sentence);
  const outputs = Object.fromEntries(
    (await readFile(output, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
  assert.equal(outputs.authorized, 'false');
  assert.equal(outputs.release_sha, '');
  assert.equal(outputs.environment, '');
  assert.equal(outputs.already_released, 'false');
  assert.doesNotMatch(deferred.stdout, /"ok":true/);

  await writeFile(output, 'authorized=true\nrelease_sha=already-set\n');
  const substituted = await run(substitutedScript);
  assert.equal(substituted.status, 0, substituted.stderr);
  assert.doesNotMatch(substituted.stdout, /SHOULD_NOT_RUN/);
  assert.ok(
    substituted.stdout.includes(`::warning::${sentence}`),
    substituted.stdout
  );
  assert.equal((await readFile(summary, 'utf8')).trim(), sentence);
  const substitutedOutputs = Object.fromEntries(
    (await readFile(output, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
  assert.equal(substitutedOutputs.authorized, 'false');
  assert.equal(substitutedOutputs.release_sha, '');

  const dateLog = join(root, 'date.log');
  await writeFile(
    join(mockBin, 'date'),
    `#!/usr/bin/env bash
set -euo pipefail
if [ -n "\${MOCK_DATE_LOG:-}" ]; then
  printf '%s\\n' "$*" >> "$MOCK_DATE_LOG"
fi
# macOS runners ship date at /bin/date and have no /usr/bin/date. Search a
# candidate list (DATE_CANDIDATES, else those two paths) instead of execing
# a hardcoded /usr/bin/date. The shim directory is already first on PATH, so
# a bare \`command -v date\` would find this script.
resolve_real_date() {
  local candidate candidates="\${DATE_CANDIDATES:-/bin/date:/usr/bin/date}"
  local IFS=':'
  for candidate in $candidates; do
    if [ -n "$candidate" ] && [ -f "$candidate" ] && [ -x "$candidate" ]; then
      printf '%s\\n' "$candidate"
      return 0
    fi
  done
  echo "date: no real date binary on DATE_CANDIDATES" >&2
  return 1
}
exec_real_date() {
  local real
  real="$(resolve_real_date)" || exit 1
  if [ -n "\${MOCK_DATE_LOG:-}" ]; then
    printf 'resolved %s\\n' "$real" >> "$MOCK_DATE_LOG"
  fi
  exec "$real" "$@"
}
if [ "\${MOCK_DATE:-gnu}" != bsd ]; then
  exec_real_date "$@"
fi
has_d=0
has_r=0
prev=""
epoch=""
for arg in "$@"; do
  if [ "$arg" = "-d" ]; then
    has_d=1
  fi
  if [ "$prev" = "-r" ]; then
    has_r=1
    epoch="$arg"
  fi
  prev="$arg"
done
if [ "$has_d" -eq 1 ]; then
  echo "date: illegal option -- d" >&2
  exit 1
fi
if [ "$has_r" -eq 1 ]; then
  node -e 'const epoch = Number(process.argv[1]); if (!Number.isFinite(epoch)) process.exit(1); process.stdout.write(new Date(epoch * 1000).toISOString().slice(0, 19) + "Z\\n");' "$epoch"
  exit 0
fi
exec_real_date "$@"
`,
    { mode: 0o755 }
  );
  await writeFile(output, 'authorized=true\nrelease_sha=already-set\n');
  const bsd = await run(directScript, {
    MOCK_DATE: 'bsd',
    MOCK_DATE_LOG: dateLog,
  });
  assert.equal(bsd.status, 0, bsd.stderr);
  assert.doesNotMatch(bsd.stderr, /could not format the reset instant/);
  assert.ok(bsd.stdout.includes(`::warning::${sentence}`), bsd.stdout);
  assert.equal((await readFile(summary, 'utf8')).trim(), sentence);
  const dateCalls = await readFile(dateLog, 'utf8');
  assert.match(dateCalls, /-d /);
  assert.match(dateCalls, /-r /);
  assert.match(dateCalls, /resolved \/bin\/date/);
  assert.doesNotMatch(dateCalls, /\/usr\/bin\/date/);

  // macOS layout: /usr/bin/date is absent, so the shim must skip it and use
  // the only executable candidate. The fixture wraps the host date captured
  // before this shim is on PATH. Asserting the resolved path is the fixture
  // keeps a Linux host that still has /usr/bin/date from passing a hardcoded
  // exec of that binary.
  const macDateLog = join(root, 'mac-date.log');
  const layoutBin = join(root, 'macos-layout', 'bin');
  const layoutUsrBin = join(root, 'macos-layout', 'usr', 'bin');
  await mkdir(layoutBin, { recursive: true });
  await mkdir(layoutUsrBin, { recursive: true });
  const hostDate = execFileSync('bash', ['-c', 'command -v date'], {
    encoding: 'utf8',
  }).trim();
  assert.match(hostDate, /^\/[\w./-]+$/);
  const fixtureDate = join(layoutBin, 'date');
  await writeFile(
    fixtureDate,
    `#!/usr/bin/env bash
set -euo pipefail
exec ${hostDate} "$@"
`,
    { mode: 0o755 }
  );
  await writeFile(output, 'authorized=true\nrelease_sha=already-set\n');
  const macOnly = await run(directScript, {
    DATE_CANDIDATES: `${join(layoutUsrBin, 'date')}:${fixtureDate}`,
    MOCK_DATE: 'bsd',
    MOCK_DATE_LOG: macDateLog,
  });
  assert.equal(macOnly.status, 0, macOnly.stderr);
  assert.doesNotMatch(macOnly.stderr, /could not format the reset instant/);
  assert.ok(macOnly.stdout.includes(`::warning::${sentence}`), macOnly.stdout);
  assert.equal((await readFile(summary, 'utf8')).trim(), sentence);
  const macDateCalls = await readFile(macDateLog, 'utf8');
  assert.match(macDateCalls, /-d /);
  assert.match(macDateCalls, /-r /);
  assert.ok(macDateCalls.includes(`resolved ${fixtureDate}`), macDateCalls);
  assert.doesNotMatch(macDateCalls, /\/usr\/bin\/date/);
  assert.doesNotMatch(
    macDateCalls,
    new RegExp(`resolved ${join(layoutUsrBin, 'date').replaceAll('/', '\\/')}`)
  );

  await writeFile(output, '');
  const denied = await run(directScript, {
    MOCK_ERROR: 'gh: Resource not accessible by integration (HTTP 403)',
  });
  assert.equal(denied.status, 1);
  assert.doesNotMatch(denied.stdout, /::warning::/);
  assert.doesNotMatch(denied.stdout, /Deferring desktop publication/);
  assert.equal((await readFile(summary, 'utf8')).trim(), '');
  assert.doesNotMatch(denied.stderr, /Holding /);

  await writeFile(output, '');
  const missingReset = await run(directScript, { MOCK_RESET: 'missing' });
  assert.equal(missingReset.status, 1);
  assert.match(missingReset.stderr, /no x-ratelimit-reset/);
  assert.doesNotMatch(missingReset.stdout, /::warning::/);
  assert.equal((await readFile(summary, 'utf8')).trim(), '');
});

test('production publication waits out GitHub quota and preserves fail-closed provenance', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-publish-quota-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const mockBin = join(root, 'bin');
  const releaseSha = 'a'.repeat(40);
  const currentSha = 'b'.repeat(40);
  await mkdir(mockBin);
  await mkdir(join(root, 'scripts/lib'), { recursive: true });
  await copyFile(
    new URL('./lib/github-rate-limit.mjs', import.meta.url),
    join(root, 'scripts/lib/github-rate-limit.mjs')
  );
  await mkdir(join(root, 'apps/desktop/dist'), { recursive: true });
  await writeFile(join(root, 'VERSION'), '1.2.3\n');
  for (const name of expectedDesktopAssetNames('1.2.3', 'production')) {
    await writeFile(join(root, 'apps/desktop/dist', name), 'packaged asset');
  }
  await writeFile(
    join(root, 'compare.json'),
    JSON.stringify({
      status: 'ahead',
      base_commit: { sha: releaseSha },
      merge_base_commit: { sha: releaseSha },
      ahead_by: 1,
      behind_by: 0,
      commits: [{ sha: currentSha }],
    })
  );
  await writeFile(
    join(mockBin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$2" = rate_limit ]; then
  printf '0 %s\\n' "$(( $(date +%s) + MOCK_RESET_SECONDS ))"
  exit 0
fi
if [[ "$2" == *"$MOCK_FAIL_ENDPOINT"* ]]; then
  count=0
  if [ -f attempts ]; then read -r count < attempts; fi
  count=$((count + 1))
  printf '%s\\n' "$count" > attempts
  if [ "$count" -le "$MOCK_FAILURES" ]; then
    echo "$MOCK_ERROR" >&2
    exit 1
  fi
fi
if [[ "$2" == */commits/main ]]; then
  echo '${currentSha}'
else
  cat compare.json
fi
`,
    { mode: 0o755 }
  );
  await mkdir(join(root, '.github/scripts'), { recursive: true });
  await copyFile(
    new URL('../.github/scripts/resolve-main-sha.sh', import.meta.url),
    join(root, '.github/scripts/resolve-main-sha.sh')
  );
  await writeFile(
    join(mockBin, 'git'),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = ls-remote ]; then
  printf '%s\\trefs/heads/main\\n' "$MOCK_MAIN_SHA"
  exit 0
fi
printf 'unexpected git: %s\\n' "$*" >&2
exit 64
`,
    { mode: 0o755 }
  );
  await writeFile(
    join(mockBin, 'node'),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = scripts/desktop-release-assets.mjs ]; then
  touch published
else
  exec "$MOCK_REAL_NODE" "$@"
fi
`,
    { mode: 0o755 }
  );
  // Exercise the real retry CLI with a deterministic clock wait, without
  // spending quota or sleeping through a real reset in the test runner.
  await writeFile(
    join(root, 'no-sleep.mjs'),
    `import { appendFileSync } from 'node:fs';
globalThis.setTimeout = (callback, ms) => {
  appendFileSync('sleeps', String(ms) + '\\n');
  callback();
  return 0;
};
`
  );
  const body = shellStepBody(
    desktopWorkflow,
    'Publish production desktop release'
  ).replaceAll('${{ github.repository }}', 'JovieInc/Jovie');
  const run = async (overrides = {}) => {
    for (const name of ['attempts', 'published', 'sleeps']) {
      await rm(join(root, name), { force: true });
    }
    return spawnSync('bash', ['-c', body], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        MOCK_ERROR: 'gh: API rate limit exceeded for installation. (HTTP 403)',
        MOCK_FAILURES: '1',
        MOCK_FAIL_ENDPOINT: 'commits/main',
        MOCK_MAIN_SHA: currentSha,
        MOCK_REAL_NODE: process.execPath,
        MOCK_RESET_SECONDS: '90',
        NODE_OPTIONS: `--import=${join(root, 'no-sleep.mjs')}`,
        PATH: `${mockBin}:${process.env.PATH}`,
        RELEASE_SHA: releaseSha,
        ...overrides,
      },
    });
  };
  const published = () => readFile(join(root, 'published'));
  // Installation 403 on GET /commits/main is not the main SHA read anymore.
  const shaRead = await run({ MOCK_FAIL_ENDPOINT: 'commits/main' });
  assert.equal(shaRead.status, 0, shaRead.stderr);
  await published();
  await assert.rejects(readFile(join(root, 'attempts')), { code: 'ENOENT' });
  const recovered = await run({ MOCK_FAIL_ENDPOINT: 'compare/' });
  assert.equal(recovered.status, 0, recovered.stderr);
  await published();
  assert.equal((await readFile(join(root, 'attempts'), 'utf8')).trim(), '2');
  const wait = Number((await readFile(join(root, 'sleeps'), 'utf8')).trim());
  assert.ok(wait >= 90_000 && wait <= 91_000, `Unexpected wait: ${wait}`);
  for (const overrides of [
    { MOCK_FAIL_ENDPOINT: 'compare/', MOCK_RESET_SECONDS: '3600' },
    { MOCK_FAIL_ENDPOINT: 'compare/', MOCK_FAILURES: '4' },
    {
      MOCK_FAIL_ENDPOINT: 'compare/',
      MOCK_ERROR: 'gh: Resource not accessible by integration (HTTP 403)',
    },
  ]) {
    const failed = await run(overrides);
    assert.notEqual(failed.status, 0, failed.stderr);
    await assert.rejects(published(), { code: 'ENOENT' });
    assert.equal(
      (await readFile(join(root, 'attempts'), 'utf8')).trim(),
      overrides.MOCK_FAILURES || '1'
    );
  }
  await writeFile(join(root, 'compare.json'), '{"status":"diverged"}');
  const untrusted = await run();
  assert.notEqual(untrusted.status, 0);
  assert.match(untrusted.stdout, /not a trusted ancestor/);
  await assert.rejects(published(), { code: 'ENOENT' });
});

test('packaging revalidation survives an installation 403 on commits/main', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-revalidate-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const releaseSha = 'a'.repeat(40);
  const currentSha = 'b'.repeat(40);
  const mockBin = join(root, 'bin');
  await mkdir(join(root, '.github/scripts'), { recursive: true });
  await mkdir(mockBin);
  for (const name of ['resolve-main-sha.sh', 'gh-api-hold.sh']) {
    await copyFile(
      new URL(`../.github/scripts/${name}`, import.meta.url),
      join(root, '.github/scripts', name)
    );
  }
  await writeFile(
    join(mockBin, 'git'),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = ls-remote ]; then
  printf '%s\\tls-remote\\n' "$MOCK_MAIN_SHA" >> "$MOCK_GIT_LOG"
  printf '%s\\trefs/heads/main\\n' "$MOCK_MAIN_SHA"
  exit 0
fi
printf 'unexpected git: %s\\n' "$*" >&2
exit 64
`,
    { mode: 0o755 }
  );
  await writeFile(
    join(mockBin, 'sleep'),
    `#!/usr/bin/env bash
printf '%s\\n' "$1" >> "$MOCK_SLEEP_LOG"
`,
    { mode: 0o755 }
  );
  await writeFile(
    join(mockBin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
endpoint=""
for arg in "$@"; do
  case "$arg" in
    repos/*|rate_limit) endpoint="$arg" ;;
  esac
done
printf '%s\\n' "$endpoint" >> "$MOCK_GH_LOG"
if [ "$endpoint" = rate_limit ]; then
  printf '%s\\n' "$MOCK_RESET"
  exit 0
fi
if [[ "$endpoint" == *commits/main* ]]; then
  echo "$MOCK_ERROR" >&2
  exit 1
fi
if [ "\${MOCK_COMPARE_FAIL:-}" = 1 ]; then
  echo "$MOCK_ERROR" >&2
  exit 1
fi
printf '%s' "$MOCK_COMPARE_JSON"
`,
    { mode: 0o755 }
  );
  const ahead = JSON.stringify({
    status: 'ahead',
    base_commit: { sha: releaseSha },
    merge_base_commit: { sha: releaseSha },
    ahead_by: 1,
    behind_by: 0,
    commits: [{ sha: currentSha }],
  });
  const rawBody = shellStepBody(
    desktopWorkflow,
    'Revalidate authorized mainline source before packaging'
  );
  const nextStep = rawBody
    .split('\n')
    .findIndex(line => line.startsWith('      - '));
  const body =
    nextStep === -1
      ? rawBody
      : rawBody.split('\n').slice(0, nextStep).join('\n');
  const run = async env => {
    for (const name of ['git.log', 'gh.log', 'sleep.log']) {
      await rm(join(root, name), { force: true });
    }
    return spawnSync('bash', ['-c', body], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GH_API_HOLD_BUDGET_SECONDS: '600',
        GH_TOKEN: 'test-token',
        MOCK_COMPARE_JSON: ahead,
        MOCK_ERROR: 'gh: API rate limit exceeded for installation. (HTTP 403)',
        MOCK_GH_LOG: join(root, 'gh.log'),
        MOCK_GIT_LOG: join(root, 'git.log'),
        MOCK_MAIN_SHA: releaseSha,
        MOCK_RESET: String(Math.floor(Date.now() / 1000) + 3600),
        MOCK_SLEEP_LOG: join(root, 'sleep.log'),
        PATH: `${mockBin}:${process.env.PATH}`,
        RELEASE_SHA: releaseSha,
        REPOSITORY: 'JovieInc/Jovie',
        ...env,
      },
    });
  };
  const ghLog = async () =>
    readFile(join(root, 'gh.log'), 'utf8').catch(() => '');

  const sameTip = await run();
  assert.equal(sameTip.status, 0, sameTip.stderr);
  assert.match(
    await readFile(join(root, 'git.log'), 'utf8'),
    new RegExp(releaseSha)
  );
  assert.doesNotMatch(await ghLog(), /commits\/main/);

  const ancestor = await run({ MOCK_MAIN_SHA: currentSha });
  assert.equal(ancestor.status, 0, ancestor.stderr);
  assert.match(await ghLog(), /compare\//);
  assert.equal(
    await readFile(join(root, 'sleep.log'), 'utf8').catch(() => ''),
    ''
  );

  const diverged = await run({
    MOCK_COMPARE_JSON: JSON.stringify({ status: 'diverged', behind_by: 1 }),
    MOCK_MAIN_SHA: currentSha,
  });
  assert.notEqual(diverged.status, 0);
  assert.match(diverged.stdout, /not a trusted ancestor/);

  const exhausted = await run({
    MOCK_COMPARE_FAIL: '1',
    MOCK_MAIN_SHA: currentSha,
  });
  assert.notEqual(exhausted.status, 0);
  assert.match(exhausted.stderr, /outside the 600s budget/);
  assert.match(exhausted.stderr, /Not passing/);

  const denied = await run({
    MOCK_COMPARE_FAIL: '1',
    MOCK_ERROR: 'gh: Resource not accessible by integration (HTTP 403)',
    MOCK_MAIN_SHA: currentSha,
  });
  assert.notEqual(denied.status, 0);
  assert.doesNotMatch(denied.stderr, /Holding /);
  assert.doesNotMatch(denied.stdout, /not a trusted ancestor/);
});

test('desktop authorizer accepts an exact successful recovered production marker', () => {
  const proof = step(
    job(desktopWorkflow, 'authorize-release'),
    'Cross-prove exact production evidence'
  );

  assertPatterns(proof, [
    /\.path == "\.github\/workflows\/production-marker-recovery\.yml"/,
    /\.name == "Production Marker Recovery"/,
    /\.name == "Recover exact verified-generation marker"/,
    /\.name == "Confirm uploaded recovered marker bytes"/,
    /\.recoveredFromControllerRun/,
    /\.recoveredFromControllerAttempt/,
  ]);
});

test('scheduled staging defers while exact push CI is still running', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-staging-ci-defer-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const repository = 'JovieInc/Jovie';
  const releaseSha = 'a'.repeat(40);
  const workflowId = 707;

  const mockBin = join(root, 'bin');
  await mkdir(mockBin);
  const mockGh = join(mockBin, 'gh');
  await writeFile(
    mockGh,
    `#!/usr/bin/env bash
set -euo pipefail
endpoint="\${!#}"
case "$endpoint" in
  *"actions/workflows/ci.yml") printf '%s' "$MOCK_CI_WORKFLOW_JSON" ;;
  *"actions/workflows/"*"/runs"*) printf '%s' "$MOCK_CI_RUNS_JSON" ;;
  *) printf 'unexpected gh endpoint: %s\\n' "$endpoint" >&2; exit 64 ;;
esac
`
  );
  await chmod(mockGh, 0o755);

  const proof = shellStepBody(
    desktopWorkflow,
    'Cross-prove exact production evidence'
  );
  const stagingStart = proof.indexOf('if [ "$environment" = "staging" ]; then');
  const stagingEnd = proof.indexOf('prove_existing_production_marker() {');
  assert.ok(
    stagingStart >= 0 && stagingEnd > stagingStart,
    'missing staging exact-CI gate block'
  );
  const stagingGate = `set -euo pipefail\n${proof.slice(stagingStart, stagingEnd)}\necho fell-through\n`;

  const ciRun = overrides => ({
    head_sha: releaseSha,
    head_branch: 'main',
    head_repository: { full_name: repository },
    event: 'push',
    path: '.github/workflows/ci.yml',
    ...overrides,
  });
  const run = runsJson =>
    spawnSync('bash', ['-c', stagingGate], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_OUTPUT: join(root, 'output.txt'),
        MOCK_CI_RUNS_JSON: JSON.stringify({ workflow_runs: runsJson }),
        MOCK_CI_WORKFLOW_JSON: JSON.stringify({
          id: workflowId,
          name: 'CI',
          path: '.github/workflows/ci.yml',
        }),
        PATH: `${mockBin}:${process.env.PATH}`,
        REPOSITORY: repository,
        environment: 'staging',
        release_sha: releaseSha,
      },
    });

  const inFlight = run([ciRun({ status: 'in_progress' })]);
  assert.equal(inFlight.status, 0, inFlight.stderr);
  assert.match(inFlight.stdout, /still running; deferring staging publication/);
  assert.doesNotMatch(inFlight.stdout, /fell-through/);

  const queued = run([ciRun({ status: 'queued' })]);
  assert.equal(queued.status, 0, queued.stderr);
  assert.match(queued.stdout, /still running; deferring staging publication/);

  const green = run([ciRun({ status: 'completed', conclusion: 'success' })]);
  assert.equal(green.status, 0, green.stderr);
  const authorized = await readFile(join(root, 'output.txt'), 'utf8');
  assert.match(authorized, /^authorized=true$/m);

  const failed = run([ciRun({ status: 'completed', conclusion: 'failure' })]);
  assert.equal(failed.status, 1);
  assert.match(
    failed.stdout,
    /lacks an exact successful CI run for staging publication/
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
    /status=completed&per_page=100/,
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
  assert.doesNotMatch(proof, /gh api[\s\S]{0,160}\|\| continue/);
  assert.doesNotMatch(
    proof,
    /if \[ "\$EVENT_NAME" = "workflow_dispatch" \]; then\s+exit 0/
  );
  assert.match(
    proof,
    /Production desktop reconciliation requires a proven desktop publish baseline/
  );
  const reconciliationExit = proof.indexOf(
    'if [ "$EVENT_NAME" = "workflow_dispatch" ] &&'
  );
  assert.ok(
    reconciliationExit > proof.indexOf('echo "authorized=true"'),
    'manual force/staging bypass must remain behind production authorization'
  );
  assert.ok(
    reconciliationExit < proof.indexOf('publish_markers="$(gh api'),
    'production reconciliation must continue into durable baseline discovery'
  );
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
  const missingReconciliationBaseline = proof.indexOf(
    'Production desktop reconciliation requires a proven desktop publish baseline'
  );
  assert.ok(
    missingReconciliationBaseline > failClosedIndex,
    'expired or inconsistent marker history must retain its existing fail-closed error'
  );
  assert.ok(
    missingReconciliationBaseline < proof.indexOf('legacy_runs_json='),
    'markerless reconciliation must fail before legacy or bootstrap fallback'
  );
});

test('desktop selection finds an intervening JOV-5996 change from the durable baseline', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-select-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

  git('init', '-q');
  git('config', 'user.email', 'desktop-release-test@jov.ie');
  git('config', 'user.name', 'Desktop Release Test');
  await writeFile(join(root, 'README.md'), 'baseline\n');
  git('add', 'README.md');
  git('commit', '-qm', 'baseline');
  const baseline = git('rev-parse', 'HEAD');

  await mkdir(join(root, 'apps/desktop/src'), { recursive: true });
  await writeFile(
    join(root, 'apps/desktop/src/preload.ts'),
    'export const sandboxPreloadIsSelfContained = true;\n'
  );
  git('add', 'apps/desktop/src/preload.ts');
  git('commit', '-qm', 'fix desktop preload');
  await writeFile(join(root, 'README.md'), 'baseline\nunrelated follow-up\n');
  git('add', 'README.md');
  git('commit', '-qm', 'unrelated follow-up');
  const releaseSha = git('rev-parse', 'HEAD');
  const repository = 'JovieInc/Jovie';
  const artifactId = 101;
  const runId = 202;
  const workflowId = 303;
  const publisherJobId = 404;
  // workflow_run publishes stamp the run with main's newer tip, not the
  // published generation (the 26.9.15/26.9.16 marker regression).
  const publisherRunHead = 'c'.repeat(40);
  const markerName = 'desktop-production-published.json';
  await writeFile(
    join(root, markerName),
    JSON.stringify({
      schema: 1,
      environment: 'production',
      sha: baseline,
      runId: String(runId),
      publisherAttempt: '1',
      publisherJobId: String(publisherJobId),
    })
  );
  const markerArchive = join(root, 'desktop-production-published.zip');
  execFileSync('zip', ['-q', markerArchive, markerName], { cwd: root });
  const mockBin = join(root, 'bin');
  await mkdir(mockBin);
  const mockGh = join(mockBin, 'gh');
  await writeFile(
    mockGh,
    `#!/usr/bin/env bash
set -euo pipefail
endpoint="\${!#}"
case "$endpoint" in
  *"actions/artifacts?name=desktop-production-published"*) printf '%s' "$MOCK_MARKERS_JSON" ;;
  *"actions/runs/$MOCK_RUN_ID/attempts/1/jobs"*) printf '%s' "$MOCK_JOBS_JSON" ;;
  *"actions/runs/$MOCK_RUN_ID") printf '%s' "$MOCK_RUN_JSON" ;;
  *"actions/workflows/$MOCK_WORKFLOW_ID") printf '%s' "$MOCK_WORKFLOW_JSON" ;;
  *"actions/artifacts/$MOCK_ARTIFACT_ID/zip") command cat "$MOCK_MARKER_ARCHIVE" ;;
  *) printf 'unexpected gh endpoint: %s\n' "$endpoint" >&2; exit 64 ;;
esac
`
  );
  await chmod(mockGh, 0o755);

  const proofBody = shellStepBody(
    desktopWorkflow,
    'Cross-prove exact production evidence'
  );
  const baselineStart = proofBody.indexOf('baseline_sha=""');
  const baselineOutputLine =
    'echo "baseline_sha=$baseline_sha" >> "$GITHUB_OUTPUT"';
  const baselineEnd = proofBody.indexOf(baselineOutputLine, baselineStart);
  assert.ok(
    baselineStart >= 0 && baselineEnd > baselineStart,
    'missing durable baseline proof block'
  );
  const authorizationOutput = join(root, 'authorization-output.txt');
  await writeFile(authorizationOutput, '');
  execFileSync(
    'bash',
    [
      '-c',
      `release_sha="$RELEASE_SHA"\n${proofBody.slice(
        baselineStart,
        baselineEnd + baselineOutputLine.length
      )}`,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        DESKTOP_RUN_ATTEMPT: '1',
        DESKTOP_RUN_ID: '505',
        EVENT_NAME: 'workflow_dispatch',
        GITHUB_OUTPUT: authorizationOutput,
        MANUAL_FORCE_REBUILD: 'false',
        MOCK_ARTIFACT_ID: String(artifactId),
        MOCK_JOBS_JSON: JSON.stringify([
          {
            jobs: [
              {
                id: publisherJobId,
                name: 'Publish production desktop release',
                head_sha: publisherRunHead,
                status: 'completed',
                conclusion: 'success',
                steps: [
                  {
                    name: 'Publish production desktop release',
                    status: 'completed',
                    conclusion: 'success',
                  },
                ],
              },
            ],
          },
        ]),
        MOCK_MARKERS_JSON: JSON.stringify({
          artifacts: [
            {
              id: artifactId,
              name: 'desktop-production-published',
              expired: false,
              created_at: '2026-09-09T00:00:00Z',
              workflow_run: { id: runId },
            },
          ],
        }),
        MOCK_MARKER_ARCHIVE: markerArchive,
        MOCK_RUN_ID: String(runId),
        MOCK_RUN_JSON: JSON.stringify({
          workflow_id: workflowId,
          run_attempt: 1,
          head_branch: 'main',
          head_repository: { full_name: repository },
          path: '.github/workflows/desktop-release.yml',
          event: 'workflow_run',
          head_sha: publisherRunHead,
          display_title: `Desktop release ${baseline}`,
        }),
        MOCK_WORKFLOW_ID: String(workflowId),
        MOCK_WORKFLOW_JSON: JSON.stringify({
          id: workflowId,
          name: 'desktop-release',
          path: '.github/workflows/desktop-release.yml',
        }),
        PATH: `${mockBin}:${process.env.PATH}`,
        RELEASE_SHA: releaseSha,
        REPOSITORY: repository,
        RUNNER_TEMP: root,
        environment: 'production',
      },
    }
  );
  const provenBaseline = (await readFile(authorizationOutput, 'utf8')).match(
    /^baseline_sha=([0-9a-f]{40})$/m
  )?.[1];
  assert.equal(provenBaseline, baseline);
  const output = join(root, 'github-output.txt');
  await writeFile(output, '');

  const stdout = execFileSync(
    'bash',
    [
      '-c',
      shellStepBody(
        desktopWorkflow,
        'Select desktop-relevant production generation'
      ),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ALREADY_RELEASED: 'false',
        AUTHORIZED: 'true',
        BASELINE_SHA: provenBaseline,
        GITHUB_OUTPUT: output,
        MANUAL: 'false',
        RELEASE_SHA: releaseSha,
      },
    }
  );
  const outputs = await readFile(output, 'utf8');

  assert.match(stdout, /apps\/desktop\/src\/preload\.ts/);
  assert.match(
    stdout,
    /Verified production generation requires a post-land desktop release stamp/
  );
  assert.match(outputs, /^should_stamp=true$/m);
  assert.doesNotMatch(outputs, /^should_release=true$/m);
});

test('desktop reconciliation continues to baseline proof and fails closed without one', () => {
  const proof = step(
    job(desktopWorkflow, 'authorize-release'),
    'Cross-prove exact production evidence'
  );
  const afterAuthorization = proof.slice(
    proof.indexOf('echo "authorized=true"')
  );
  const dispatchGate = afterAuthorization.match(
    /\s+if \[ "\$EVENT_NAME" = "workflow_dispatch" \] &&[\s\S]*?\n\s+fi/
  )?.[0];
  assert.ok(dispatchGate, 'missing workflow_dispatch reconciliation gate');
  const gateScript = `${dedentShell(dispatchGate)}\nprintf continued`;

  const reconcile = execFileSync('bash', ['-c', gateScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT_NAME: 'workflow_dispatch',
      MANUAL_FORCE_REBUILD: 'false',
      environment: 'production',
    },
  });
  assert.equal(reconcile, 'continued');
  const forced = execFileSync('bash', ['-c', gateScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT_NAME: 'workflow_dispatch',
      MANUAL_FORCE_REBUILD: 'true',
      environment: 'production',
    },
  });
  assert.equal(forced, '');
  const staging = execFileSync('bash', ['-c', gateScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT_NAME: 'workflow_dispatch',
      MANUAL_FORCE_REBUILD: 'false',
      environment: 'staging',
    },
  });
  assert.equal(staging, '');
  const workflowRun = execFileSync('bash', ['-c', gateScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT_NAME: 'workflow_run',
      MANUAL_FORCE_REBUILD: 'false',
      environment: 'production',
    },
  });
  assert.equal(workflowRun, 'continued');

  const expiredStart = proof.indexOf(
    'if [ "$publish_marker_presence_count" -gt 0 ]'
  );
  const expiredGuard = proof
    .slice(expiredStart)
    .match(/^if [\s\S]*?\n\s+fi/m)?.[0];
  assert.ok(expiredGuard, 'missing expired baseline fail-closed guard');
  const expired = spawnSync(
    'bash',
    ['-c', `${dedentShell(expiredGuard)}\nprintf continued`],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        baseline_sha: '',
        publish_marker_presence_count: '1',
      },
    }
  );
  assert.equal(expired.status, 1);
  assert.match(
    expired.stdout,
    /1 desktop publish marker\(s\) existed, but none fully proved a release/
  );

  const missingStart = proof.indexOf(
    'if [ "$EVENT_NAME" = "workflow_dispatch" ] &&',
    proof.indexOf('publish_marker_presence_count')
  );
  const missingGuard = proof
    .slice(missingStart)
    .match(/^if [\s\S]*?\n\s+fi/m)?.[0];
  assert.ok(missingGuard, 'missing baseline fail-closed guard');
  const missing = spawnSync(
    'bash',
    ['-c', `${dedentShell(missingGuard)}\nprintf continued`],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        EVENT_NAME: 'workflow_dispatch',
        MANUAL_FORCE_REBUILD: 'false',
        baseline_sha: '',
        environment: 'production',
      },
    }
  );
  assert.equal(missing.status, 1);
  assert.match(
    missing.stdout,
    /Production desktop reconciliation requires a proven desktop publish baseline/
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

  const candidateProgram = proof.match(
    /marker_candidates="\$\(jq -r '\n([\s\S]*?)\n\s+' <<<"\$publish_markers"\)"/
  )?.[1];
  assert.ok(candidateProgram, 'missing durable baseline marker selector');
  const selected = execFileSync('jq', ['-r', candidateProgram], {
    encoding: 'utf8',
    input: JSON.stringify({
      artifacts: [
        marker,
        {
          ...marker,
          id: 3,
          expired: false,
          workflow_run: { id: 4 },
        },
      ],
    }),
  });
  assert.equal(selected.trim(), '3\t4');
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
  const triggerHead = 'c'.repeat(40);
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
        // The run head is main's tip at trigger time, newer than the
        // generation it published.
        head_sha: triggerHead,
        event: 'workflow_run',
        display_title: `Desktop release ${newSha}`,
        created_at: '2026-07-19T00:00:00Z',
      },
    ]),
  });
  assert.equal(output.trim(), `2\t1\t${newSha}\t${triggerHead}`);
});

test('automatic desktop publishing stamps production-impacting source before release', () => {
  const authorize = job(desktopWorkflow, 'authorize-release');
  const select = step(
    authorize,
    'Select desktop-relevant production generation'
  );
  const productionPaths = select
    .match(/production_paths=\(\n([\s\S]*?)\n\s+\)/)?.[1]
    ?.trim()
    .split(/\s+/);
  assert.equal(productionPaths?.includes('apps/desktop/src'), true);
  assert.equal(productionPaths?.includes('apps/desktop/package.json'), true);
  assert.equal(
    productionPaths?.includes('.github/workflows/desktop-release.yml'),
    true
  );
  assertPatterns(select, [
    /version_changes=/,
    /production_changes=/,
    /should_stamp=false/,
    /should_stamp=true/,
    /should_release=true/,
  ]);
  assert.match(
    authorize,
    /should_stamp: \$\{\{ steps\.select\.outputs\.should_stamp \}\}/
  );

  const stamp = job(desktopWorkflow, 'stamp-production-release');
  assertPatterns(stamp, [
    /needs\.authorize-release\.outputs\.should_stamp == 'true'/,
    /actions\/create-github-app-token@/,
    /JOVIE_BOT_APP_ID/,
    /JOVIE_BOT_PRIVATE_KEY/,
    /ref: \$\{\{ needs\.authorize-release\.outputs\.release_sha \}\}/,
    /\.github\/scripts\/resolve-main-sha\.sh/,
    /\.github\/scripts\/gh-api-hold\.sh/,
    /node scripts\/version-stamp\.mjs/,
    /node scripts\/version-check\.mjs/,
    /cursor\/stable-desktop-publish-/,
    /gh pr create/,
  ]);
  // ci-release/legacy-merge-queue-label: the `merge-queue` label is never
  // added, interpreted, or retained — native GitHub queue state is
  // authoritative (docs/ci/CI_RELEASE_INCIDENTS.md). The stamp step must not
  // re-add the retired label after `gh pr create`.
  assert.doesNotMatch(stamp, /gh pr edit [^\n]*--add-label "merge-queue"/);
});

test('desktop staging publishes an exact signed prerelease and production stays separately proven', () => {
  const authorize = step(
    job(desktopWorkflow, 'authorize-release'),
    'Cross-prove exact production evidence'
  );
  const build = job(desktopWorkflow, 'build');
  const productionPackage = step(build, 'Package production desktop app');
  const productionVerify = step(
    build,
    'Verify production desktop artifact set'
  );
  const publish = step(build, 'Publish production desktop release');
  const stagingPackage = step(build, 'Package staging desktop app');
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
    /JOVIE_RELEASE_DMG: 'true'/,
    /package:production/,
    /sync-version\.mjs[\s\S]*--staging-version/,
    /Validate rolling staging prerelease/,
    /Require staging signing and notarization credentials/,
    /JOVIE_MAC_SIGNING_IDENTITY=/,
    /desktop-release-assets\.mjs upload-and-publish/,
    /dist\/latest-mac\.yml/,
    /dist\/staging-mac\.yml/,
  ]);
  assertPatterns(publish, [
    /\.github\/scripts\/resolve-main-sha\.sh/,
    /desktop-release-assets\.mjs upload-and-publish/,
    /--dist "apps\/desktop\/dist"/,
  ]);
  assertPatterns(stagingPackage, [
    /JOVIE_DESKTOP_SOURCE_REVISION: \$\{\{ env\.RELEASE_SHA \}\}/,
    /JOVIE_RELEASE_DMG: 'true'/,
  ]);
  assertPatterns(productionPackage, [
    /JOVIE_DESKTOP_SOURCE_REVISION: \$\{\{ env\.RELEASE_SHA \}\}/,
    /JOVIE_RELEASE_DMG: 'true'/,
    /package:production/,
  ]);
  assertPatterns(productionVerify, [
    /if: env\.ENVIRONMENT == 'production'/,
    /codesign --verify --deep --strict "\$production_app"/,
    /spctl --assess --type execute --verbose=2 "\$production_app"/,
    /xcrun stapler validate "\$production_app"/,
    /codesign --verify --verbose=2 "\$production_dmg"/,
    /xcrun stapler validate "\$production_dmg"/,
    /spctl --assess --type open --context context:primary-signature/,
  ]);
  assertPatterns(stagingUpload, [
    /if: env\.ENVIRONMENT == 'staging'/,
    /desktop-staging-/,
    /staging-mac\.yml/,
    /retention-days: 7/,
  ]);
  assert.match(
    desktopStagingBuilder,
    /^artifactBuildCompleted: scripts\/notarize-release-dmg\.cjs$/m
  );
  assert.match(
    desktopProductionBuilder,
    /^artifactBuildCompleted: scripts\/notarize-release-dmg\.cjs$/m
  );
  assert.doesNotMatch(
    build,
    /- name: Notarize and staple staging desktop image/
  );
  assertPatterns(stagingPublish, [
    /compare\/\$RELEASE_SHA\.\.\.\$current_main_sha/,
    /\.merge_base_commit\.sha == \$release/,
    /\.commits[\s\S]*\.\[-1\]\.sha == \$current/,
    /\.behind_by == 0/,
    /desktop-release-assets\.mjs upload-and-publish/,
    /--environment staging/,
    /--version="\$\{\{ steps\.staging-version\.outputs\.version \}\}"/,
  ]);
  assert.doesNotMatch(stagingPublish, /--version "/);
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
    publish.indexOf('resolve-main-sha.sh') <
      publish.indexOf('desktop-release-assets.mjs upload-and-publish')
  );
  assert.ok(
    build.indexOf('Prepare private production draft') <
      build.indexOf('Package production desktop app')
  );
  assert.ok(
    build.indexOf('- name: Package production desktop app') <
      build.indexOf('- name: Verify production desktop artifact set')
  );
  assert.ok(
    build.indexOf('- name: Verify production desktop artifact set') <
      build.indexOf('- name: Publish production desktop release')
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
    /WORKFLOW_SHA: \$\{\{ github\.sha \}\}/,
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

test('production publish proof separates the released generation from its workflow transport', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-publish-proof-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const releaseSha = 'a'.repeat(40);
  const workflowSha = 'b'.repeat(40);
  const repository = 'JovieInc/Jovie';
  const runId = 101;
  const workflowId = 202;
  const publisherJobId = 303;
  const mockBin = join(root, 'bin');
  await mkdir(mockBin);
  await writeFile(
    join(mockBin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
endpoint=""
for arg in "$@"; do
  case "$arg" in repos/*) endpoint="$arg" ;; esac
done
case "$endpoint" in
  *"actions/runs/$MOCK_RUN_ID/attempts/$MOCK_RUN_ATTEMPT/jobs"*) printf '%s' "$MOCK_JOBS_JSON" ;;
  *"actions/runs/$MOCK_RUN_ID/attempts/$MOCK_RUN_ATTEMPT") printf '%s' "$MOCK_RUN_JSON" ;;
  *"actions/workflows/$MOCK_WORKFLOW_ID") printf '%s' "$MOCK_WORKFLOW_JSON" ;;
  *) printf 'unexpected gh endpoint: %s\\n' "$endpoint" >&2; exit 64 ;;
esac
`
  );
  await chmod(join(mockBin, 'gh'), 0o755);
  await mkdir(join(root, '.github/scripts'), { recursive: true });
  await copyFile(
    new URL('../.github/scripts/gh-api-hold.sh', import.meta.url),
    join(root, '.github/scripts/gh-api-hold.sh')
  );

  const result = spawnSync(
    'bash',
    [
      '-c',
      shellStepBody(desktopWorkflow, 'Cross-prove exact production publisher'),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        MOCK_JOBS_JSON: JSON.stringify([
          {
            jobs: [
              {
                id: publisherJobId,
                name: 'Publish production desktop release',
                head_sha: workflowSha,
                status: 'completed',
                conclusion: 'success',
                steps: [
                  {
                    name: 'Publish production desktop release',
                    status: 'completed',
                    conclusion: 'success',
                  },
                ],
              },
            ],
          },
        ]),
        MOCK_RUN_ATTEMPT: '1',
        MOCK_RUN_ID: String(runId),
        MOCK_RUN_JSON: JSON.stringify({
          id: runId,
          run_attempt: 1,
          workflow_id: workflowId,
          head_sha: workflowSha,
          head_branch: 'main',
          head_repository: { full_name: repository },
          path: '.github/workflows/desktop-release.yml',
          event: 'workflow_run',
          display_title: `Desktop release ${releaseSha}`,
        }),
        MOCK_WORKFLOW_ID: String(workflowId),
        MOCK_WORKFLOW_JSON: JSON.stringify({
          id: workflowId,
          name: 'desktop-release',
          path: '.github/workflows/desktop-release.yml',
        }),
        PATH: `${mockBin}:${process.env.PATH}`,
        PUBLISHED_SHA: releaseSha,
        PUBLISHER_ATTEMPT: '1',
        REPOSITORY: repository,
        RUN_ID: String(runId),
        RUNNER_TEMP: root,
        WORKFLOW_SHA: workflowSha,
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    JSON.parse(
      await readFile(join(root, 'desktop-production-published.json'), 'utf8')
    ),
    {
      schema: 1,
      environment: 'production',
      sha: releaseSha,
      runId: String(runId),
      publisherAttempt: '1',
      publisherJobId: String(publisherJobId),
    }
  );
});

test('scheduled staging reconciliation publishes only unpublished desktop changes', async () => {
  assert.match(desktopWorkflow, /schedule:\n\s+- cron: '17 10 \* \* \*'/);
  const selector = shellStepBody(
    job(desktopWorkflow, 'authorize-release'),
    'Select desktop-relevant production generation'
  );
  const root = await mkdtemp(join(tmpdir(), 'jovie-staging-reconcile-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'maintenance.auto',
        GIT_CONFIG_VALUE_0: 'false',
        GIT_CONFIG_KEY_1: 'gc.auto',
        GIT_CONFIG_VALUE_1: '0',
      },
    }).trim();
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@jovie.test');
    git('config', 'user.name', 'Test');
    await mkdir(join(root, 'apps/desktop/src'), { recursive: true });
    await writeFile(
      join(root, 'apps/desktop/src/main.ts'),
      'export const shell = 1;\n'
    );
    git('add', '.');
    git('commit', '-qm', 'baseline');
    const baseline = git('rev-parse', 'HEAD');

    await writeFile(join(root, 'README.md'), 'unrelated change\n');
    git('add', '.');
    git('commit', '-qm', 'docs');
    const docsOnly = git('rev-parse', 'HEAD');

    await writeFile(
      join(root, 'apps/desktop/src/main.ts'),
      'export const shell = 2;\n'
    );
    git('add', '.');
    git('commit', '-qm', 'desktop repair');
    const desktopChange = git('rev-parse', 'HEAD');

    const runSelector = async (source, releasedSource = baseline) => {
      const output = join(root, 'selection-output');
      await writeFile(output, '');
      const result = spawnSync('bash', ['-c', selector], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          AUTHORIZED: 'true',
          ALREADY_RELEASED: 'false',
          MANUAL: 'false',
          STAGING_AUTO: 'true',
          RELEASE_SHA: source,
          BASELINE_SHA: '',
          GITHUB_OUTPUT: output,
          REPOSITORY: 'JovieInc/Jovie',
          PATH: `${root}/bin:${process.env.PATH}`,
          STAGING_RELEASE_JSON: JSON.stringify({
            tag_name: 'desktop-staging',
            target_commitish: releasedSource,
          }),
        },
      });
      return { ...result, outputs: await readFile(output, 'utf8') };
    };
    await mkdir(join(root, 'bin'));
    await writeFile(
      join(root, 'bin/gh'),
      '#!/bin/sh\n[ "$1" = api ] && [ "$2" = repos/JovieInc/Jovie/releases/tags/desktop-staging ] || exit 3\nprintf %s "$STAGING_RELEASE_JSON"\n',
      { mode: 0o755 }
    );

    const unchanged = await runSelector(baseline);
    assert.equal(unchanged.status, 0);
    assert.doesNotMatch(unchanged.outputs, /^should_release=true$/m);
    const unrelated = await runSelector(docsOnly);
    assert.equal(unrelated.status, 0);
    assert.doesNotMatch(unrelated.outputs, /^should_release=true$/m);
    const changed = await runSelector(desktopChange);
    assert.equal(changed.status, 0);
    assert.match(changed.outputs, /^should_release=true$/m);
    const untrusted = await runSelector(baseline, desktopChange);
    assert.equal(untrusted.status, 1);
    assert.doesNotMatch(untrusted.outputs, /^should_release=true$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
  assert.doesNotThrow(() => assertStagingVersionTransition(valid));
  assert.doesNotThrow(() =>
    assertStagingVersionTransition({
      ...valid,
      currentFeedVersion: '26.8.2-staging.17823456789.1',
    })
  );
  for (const { input, message } of [
    {
      input: {
        ...valid,
        currentFeedVersion: '26.8.2-staging.17823456790.1',
        version: '26.8.2-staging.17823456789.1',
      },
      message: /not newer than current feed/,
    },
    {
      input: { ...valid, version: '26.8.1-staging.17823456791.1' },
      message: /next-patch/,
    },
    {
      input: { ...valid, version: '26.8.1+staging.17823456791.1' },
      message: /valid prerelease/,
    },
  ]) {
    assert.throws(() => assertStagingVersionTransition(input), message);
  }
});

test('staging mainline proof permits main advancement but rejects stale or diverged source', () => {
  const releaseSha = 'a'.repeat(40);
  const currentSha = 'b'.repeat(40);
  const mainline = {
    status: 'ahead',
    ahead_by: 4,
    behind_by: 0,
    base_commit: { sha: releaseSha },
    commits: [{ sha: 'c'.repeat(40) }, { sha: currentSha }],
    merge_base_commit: { sha: releaseSha },
  };

  assert.doesNotThrow(() =>
    assertMainlineAncestorCompare({
      comparison: mainline,
      currentMainSha: currentSha,
      releaseSha,
    })
  );
  assert.doesNotThrow(() =>
    assertMainlineAncestorCompare({
      comparison: {
        ...mainline,
        status: 'identical',
        ahead_by: 0,
        commits: [],
      },
      currentMainSha: releaseSha,
      releaseSha,
    })
  );

  assert.throws(
    () =>
      assertMainlineAncestorCompare({
        comparison: mainline,
        currentMainSha: currentSha,
        releaseSha: 'short',
      }),
    /Release SHA is malformed/
  );
  assert.throws(
    () =>
      assertMainlineAncestorCompare({
        comparison: mainline,
        currentMainSha: 'short',
        releaseSha,
      }),
    /Current main SHA is malformed/
  );

  for (const comparison of [
    { ...mainline, status: 'behind', behind_by: 1 },
    {
      ...mainline,
      status: 'diverged',
      merge_base_commit: { sha: 'c'.repeat(40) },
    },
    { ...mainline, base_commit: { sha: 'c'.repeat(40) } },
    { ...mainline, commits: [{ sha: 'c'.repeat(40) }] },
  ]) {
    assert.throws(
      () =>
        assertMainlineAncestorCompare({
          comparison,
          currentMainSha: currentSha,
          releaseSha,
        }),
      /not a trusted ancestor/
    );
  }
});

test('staging publication proof rejects a candidate behind the published source', () => {
  const publishedSha = 'b'.repeat(40);
  const candidateSha = 'a'.repeat(40);
  assert.throws(
    () =>
      assertCommitDescendantCompare({
        ancestorSha: publishedSha,
        comparison: {
          status: 'behind',
          ahead_by: 0,
          behind_by: 1,
          base_commit: { sha: candidateSha },
          commits: [],
          merge_base_commit: { sha: candidateSha },
        },
        descendantSha: candidateSha,
      }),
    /move backward or leave its published lineage/
  );
});

test('production desktop release is forward-only when main outruns the controller', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-forward-only-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.email', 'desktop-release-test@jov.ie');
  git('config', 'user.name', 'Desktop Release Test');
  await writeFile(join(root, 'VERSION'), '26.9.15\n');
  git('add', 'VERSION');
  git('commit', '-qm', 'verified generation');
  const releaseSha = git('rev-parse', 'HEAD');
  await writeFile(join(root, 'README.md'), 'later merge\n');
  git('add', 'README.md');
  git('commit', '-qm', 'later merge');
  const mainSha = git('rev-parse', 'HEAD');

  const mockBin = join(root, 'bin');
  await mkdir(mockBin);
  await writeFile(
    join(mockBin, 'gh'),
    `#!/usr/bin/env bash
set -euo pipefail
endpoint=""
for arg in "$@"; do
  case "$arg" in repos/*) endpoint="$arg" ;; esac
done
case "$endpoint" in
  *"commits/main") printf '%s\\n' "$MOCK_MAIN_SHA" ;;
  *"/compare/"*) printf '%s' "$MOCK_COMPARE_JSON" ;;
  *"contents/VERSION?ref="*) printf '%s\\n' "$MOCK_MAIN_VERSION" ;;
  *) printf 'unexpected gh endpoint: %s\\n' "$endpoint" >&2; exit 64 ;;
esac
`
  );
  await chmod(join(mockBin, 'gh'), 0o755);
  const realGit = execFileSync('bash', ['-lc', 'command -v git'], {
    encoding: 'utf8',
  }).trim();
  await writeFile(
    join(mockBin, 'git'),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = ls-remote ] && [[ " $* " == *" refs/heads/main "* ]]; then
  printf '%s\\trefs/heads/main\\n' "$MOCK_MAIN_SHA"
  exit 0
fi
exec ${JSON.stringify(realGit)} "$@"
`,
    { mode: 0o755 }
  );
  const runnerTemp = join(root, 'runner-temp');
  await mkdir(join(runnerTemp, '.github/scripts'), { recursive: true });
  await mkdir(join(root, '.github/scripts'), { recursive: true });
  for (const name of ['resolve-main-sha.sh', 'gh-api-hold.sh']) {
    const source = new URL(`../.github/scripts/${name}`, import.meta.url);
    await copyFile(source, join(runnerTemp, name));
    await copyFile(source, join(root, '.github/scripts', name));
  }
  const ahead = JSON.stringify({
    status: 'ahead',
    base_commit: { sha: releaseSha },
    merge_base_commit: { sha: releaseSha },
    ahead_by: 1,
    behind_by: 0,
    commits: [{ sha: mainSha }],
  });
  const diverged = JSON.stringify({
    status: 'diverged',
    base_commit: { sha: releaseSha },
    merge_base_commit: { sha: releaseSha },
    ahead_by: 1,
    behind_by: 1,
    commits: [{ sha: mainSha }],
  });
  const run = (script, env) =>
    spawnSync('bash', ['-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_OUTPUT: join(root, 'output.txt'),
        MOCK_MAIN_SHA: mainSha,
        MOCK_MAIN_VERSION: '26.9.15',
        PATH: `${mockBin}:${process.env.PATH}`,
        REPOSITORY: 'JovieInc/Jovie',
        RUNNER_TEMP: runnerTemp,
        ...env,
      },
    });

  // Authorization: a verified ancestor continues to proof; a diverged one fails.
  const proof = shellStepBody(
    desktopWorkflow,
    'Cross-prove exact production evidence'
  );
  const lineageStart = proof.indexOf('echo "environment=$environment"');
  const lineageEnd = proof.indexOf('# Staging publishes an immutable');
  assert.ok(lineageStart >= 0 && lineageEnd > lineageStart);
  const lineage = `set -euo pipefail\nrelease_sha="${releaseSha}"\n${proof.slice(
    lineageStart,
    lineageEnd
  )}\necho reached-production-proof\n`;
  const advancedAuth = run(lineage, {
    EVENT_NAME: 'workflow_run',
    MOCK_COMPARE_JSON: ahead,
    environment: 'production',
  });
  assert.equal(advancedAuth.status, 0, advancedAuth.stderr);
  assert.match(advancedAuth.stdout, /continuing forward-only/);
  assert.match(advancedAuth.stdout, /reached-production-proof/);
  const divergedAuth = run(lineage, {
    EVENT_NAME: 'workflow_run',
    MOCK_COMPARE_JSON: diverged,
    environment: 'production',
  });
  assert.equal(divergedAuth.status, 1);
  assert.match(divergedAuth.stdout, /not a trusted ancestor of current main/);
  assert.doesNotMatch(divergedAuth.stdout, /reached-production-proof/);
  assert.doesNotMatch(
    proof,
    /was superseded by \$current_main_sha\."\n\s*exit 0\n\s*fi\n\n\s*# Staging/
  );

  // Packaging and publication revalidate lineage, not exact equality.
  const build = job(desktopWorkflow, 'build');
  for (const stepName of [
    'Revalidate authorized mainline source before packaging',
    'Publish production desktop release',
  ]) {
    const body = step(build, stepName);
    assert.match(body, /compare\/\$RELEASE_SHA\.\.\.\$current_main_sha/);
    assert.doesNotMatch(body, /was superseded by/);
  }

  // Stamping: forward-only, but never races release state already on main.
  const stampBody = shellStepBody(
    desktopWorkflow,
    'Create deterministic desktop release stamp PR'
  );
  const fnStart = stampBody.indexOf('stamp_lineage_is_current() {');
  const fnEnd = stampBody.indexOf('stamp_lineage_is_current || exit 0');
  assert.ok(fnStart >= 0 && fnEnd > fnStart);
  const stamp = `set -euo pipefail\n${stampBody.slice(
    fnStart,
    fnEnd
  )}\nif stamp_lineage_is_current; then echo stamp; else echo skip; fi\n`;
  const stampEnv = { MOCK_COMPARE_JSON: ahead, RELEASE_SHA: releaseSha };
  assert.equal(run(stamp, stampEnv).stdout.trim().split('\n').at(-1), 'stamp');
  const alreadyStamped = run(stamp, {
    ...stampEnv,
    MOCK_MAIN_VERSION: '26.9.16',
  });
  assert.equal(alreadyStamped.stdout.trim().split('\n').at(-1), 'skip');
  assert.match(alreadyStamped.stdout, /already carries desktop release state/);
  const divergedStamp = run(stamp, {
    ...stampEnv,
    MOCK_COMPARE_JSON: diverged,
  });
  assert.equal(divergedStamp.stdout.trim().split('\n').at(-1), 'skip');

  // Selection: an older verified generation arriving after a newer publish
  // is covered, never an error and never a re-publish.
  await writeFile(join(root, 'output.txt'), '');
  const covered = run(
    shellStepBody(
      desktopWorkflow,
      'Select desktop-relevant production generation'
    ),
    {
      ALREADY_RELEASED: 'false',
      AUTHORIZED: 'true',
      BASELINE_SHA: mainSha,
      MANUAL: 'false',
      RELEASE_SHA: releaseSha,
    }
  );
  assert.equal(covered.status, 0, covered.stderr);
  assert.match(covered.stdout, /already covered by the newer desktop publish/);
  const outputs = await readFile(join(root, 'output.txt'), 'utf8');
  assert.match(outputs, /^should_release=false$/m);
  assert.doesNotMatch(outputs, /^should_(release|stamp)=true$/m);
});

test('desktop release CLI uses the exact merge-group base without weakening stamp scope', async t => {
  async function fixture() {
    // macOS temp directories can be symlinks; match Node's resolved CLI URL.
    const root = await realpath(
      await mkdtemp(join(tmpdir(), 'jovie-desktop-queue-base-'))
    );
    t.after(() => rm(root, { force: true, recursive: true }));
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const write = async (path, content) => {
      const destination = join(root, path);
      await mkdir(join(destination, '..'), { recursive: true });
      await writeFile(destination, content);
    };
    const contents = releaseStampContents();
    for (const path of deterministicReleaseStampFiles) {
      await write(path, contents.getBaseContent(path));
    }
    for (const path of [
      'desktop-release-guard.mjs',
      'version-fanout-guard.mjs',
      'version-stamp.mjs',
      'lib/changelog-filter-rules.mjs',
    ]) {
      const destination = join(root, 'scripts', path);
      await mkdir(join(destination, '..'), { recursive: true });
      await copyFile(new URL(`./${path}`, import.meta.url), destination);
    }
    git('init', '-q');
    git('config', 'user.email', 'desktop-guard-test@jov.ie');
    git('config', 'user.name', 'Desktop Guard Test');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    await write(
      'apps/web/prior-queue-member.ts',
      'export const prior = true;\n'
    );
    git('add', '.');
    git('commit', '-qm', 'preceding queue member');
    const queueBase = git('rev-parse', 'HEAD');
    for (const path of deterministicReleaseStampFiles) {
      await write(path, contents.getHeadContent(path));
    }
    git('add', '.');
    git('commit', '-qm', 'deterministic release stamp');
    const invoke = (environment = {}) =>
      spawnSync(
        process.execPath,
        [
          join(root, 'scripts/desktop-release-guard.mjs'),
          '--base',
          'origin/main',
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'merge_group',
            GITHUB_HEAD_REF: '',
            GITHUB_BASE_REF: '',
            GITHUB_REF_NAME: `gh-readonly-queue/main/pr-20440-${queueBase}`,
            TURBO_SCM_BASE: queueBase,
            ...environment,
          },
        }
      );
    return { git, invoke, root, write };
  }

  await t.test(
    'excludes the previous member despite a stale origin/main',
    async () => {
      const { invoke } = await fixture();
      const result = invoke();
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(
        result.stdout,
        /deterministic desktop version fan-out allowed/
      );
    }
  );
  await t.test(
    'still rejects code bundled into the release member',
    async () => {
      const { git, invoke, write } = await fixture();
      await write(
        'apps/web/bundled-with-stamp.ts',
        'export const bundled = true;\n'
      );
      git('add', '.');
      git('commit', '-qm', 'unauthorized bundled code');
      const result = invoke();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /apps\/web\/bundled-with-stamp\.ts/);
      assert.doesNotMatch(result.stderr, /prior-queue-member/);
    }
  );
  for (const base of ['', 'origin/main', 'not-a-sha']) {
    await t.test(
      `fails closed on missing or malformed exact base ${JSON.stringify(base)}`,
      async () => {
        const { invoke } = await fixture();
        const result = invoke({ TURBO_SCM_BASE: base });
        assert.equal(result.status, 1);
        assert.match(
          result.stderr,
          /merge_group requires an exact TURBO_SCM_BASE/
        );
      }
    );
  }
  await t.test('rejects an exact SHA that is not an ancestor', async () => {
    const { git, invoke } = await fixture();
    const unrelated = git(
      'commit-tree',
      'HEAD^{tree}',
      '-p',
      'refs/remotes/origin/main',
      '-m',
      'unrelated branch'
    );
    const result = invoke({ TURBO_SCM_BASE: unrelated });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not determine changed files/);
  });
  await t.test('does not apply the queue override to a source PR', async () => {
    const { invoke } = await fixture();
    const result = invoke({
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_HEAD_REF: 'release/guard-fixture',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /prior-queue-member\.ts/);
  });
});
