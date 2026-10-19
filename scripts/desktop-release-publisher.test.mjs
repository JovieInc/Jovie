import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  expectedDesktopAssetNames,
  GitHubClient,
  parseArgs,
  planReleaseAssetReadHold,
  prepare,
  RELEASE_ASSET_READ_ATTEMPTS,
  RELEASE_ASSET_READ_MAX_WAIT_MS,
  releaseMetadataUpdate,
  uploadAndPublish,
  validateReleaseAssets,
} from './desktop-release-assets.mjs';

function hash(buffer, algorithm, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function artifactBuffers(environment, version) {
  const prefix = environment === 'staging' ? 'Jovie-Staging' : 'Jovie';
  const channel =
    environment === 'staging' ? 'staging-mac.yml' : 'latest-mac.yml';
  const dmg = `${prefix}-${version}-universal.dmg`;
  const zip = `${prefix}-${version}-universal.zip`;
  const buffers = new Map([
    [dmg, Buffer.from(`signed dmg ${version}`)],
    [`${dmg}.blockmap`, Buffer.from(`dmg map ${version}`)],
    [zip, Buffer.from(`signed zip ${version}`)],
    [`${zip}.blockmap`, Buffer.from(`zip map ${version}`)],
  ]);
  const digest = name => hash(buffers.get(name), 'sha512', 'base64');
  buffers.set(
    channel,
    Buffer.from(`version: ${version}
files:
  - url: ${zip}
    sha512: ${digest(zip)}
    size: ${buffers.get(zip).length}
  - url: ${dmg}
    sha512: ${digest(dmg)}
    size: ${buffers.get(dmg).length}
path: ${zip}
sha512: ${digest(zip)}
releaseDate: 2026-08-30T00:00:00.000Z
`)
  );
  return buffers;
}

function releaseFixture(environment, version, releaseSha, draft = true) {
  return {
    id: 1,
    tag_name: environment === 'staging' ? 'desktop-staging' : `v${version}`,
    target_commitish: releaseSha,
    name: version,
    draft,
    prerelease: environment === 'staging',
    published_at: draft ? null : '2026-08-30T00:00:00Z',
  };
}

function fakeClient({
  mainSha,
  mainlineAncestor = true,
  release = null,
  seedBuffers = new Map(),
  stagingAncestor = true,
}) {
  const client = {
    buffers: new Map(),
    events: [],
    failDeleteName: null,
    failFeedUploadsRemaining: 0,
    failMetadataUpdateAt: 0,
    failTagUpdateAt: 0,
    failUploadsRemaining: new Map(),
    mainSha,
    mainlineAncestor,
    metadataUpdateCalls: 0,
    nextAssetId: 1,
    release,
    tagSha: release?.target_commitish || null,
    tagUpdateCalls: 0,
    stagingAncestor,
  };
  client.seedAsset = (name, buffer = null) => {
    const asset = {
      id: client.nextAssetId++,
      name,
      state: buffer ? 'uploaded' : 'starter',
      size: buffer?.length || 0,
      digest: buffer ? `sha256:${hash(buffer, 'sha256', 'hex')}` : null,
      ...(buffer && {
        url: `https://api.github.test/assets/${client.nextAssetId}`,
      }),
    };
    client.release.assets.push(asset);
    if (buffer) client.buffers.set(asset.id, buffer);
    return asset;
  };
  client.seedStarter = name => client.seedAsset(name);
  if (release) {
    release.upload_url = 'https://uploads.github.test/releases/1{?name,label}';
    release.assets = [];
    for (const [name, buffer] of seedBuffers) client.seedAsset(name, buffer);
  }
  client.releaseOrDraftByTag = async (tag, allowNotFound = false) => {
    if (client.release?.tag_name === tag) return client.release;
    if (allowNotFound) return null;
    throw new Error(`Release not found: ${tag}`);
  };
  client.recoverableStagingDraft = async () => null;
  client.recoverableProductionDraft = async () => null;
  client.createDraft = async ({ environment, releaseSha, version }) => {
    client.release = {
      ...releaseFixture(environment, version, releaseSha),
      assets: [],
      upload_url: 'https://uploads.github.test/releases/1{?name,label}',
    };
    return client.release;
  };
  client.releaseById = async () => client.release;
  client.downloadAsset = async asset => client.buffers.get(asset.id);
  client.deleteAsset = async assetId => {
    const asset = client.release.assets.find(item => item.id === assetId);
    if (asset.name === client.failDeleteName) {
      client.failDeleteName = null;
      client.events.push(`delete-failed:${asset.name}`);
      throw new Error(`injected ${asset.name} delete failure`);
    }
    client.events.push(`delete:${asset.name}`);
    client.release.assets = client.release.assets.filter(
      item => item.id !== assetId
    );
    client.buffers.delete(assetId);
  };
  client.uploadAsset = async (_release, name, buffer) => {
    const feed = name === 'staging-mac.yml';
    const remaining = feed
      ? client.failFeedUploadsRemaining
      : client.failUploadsRemaining.get(name) || 0;
    if (remaining > 0) {
      if (feed) client.failFeedUploadsRemaining -= 1;
      else client.failUploadsRemaining.set(name, remaining - 1);
      client.seedStarter(name);
      client.events.push(`upload-failed:${name}`);
      throw new Error(
        feed
          ? 'injected feed upload failure'
          : `injected ${name} upload failure`
      );
    }
    client.events.push(`upload:${name}`);
    return client.seedAsset(name, buffer);
  };
  client.updateReleaseMetadata = async ({
    environment,
    releaseSha,
    version,
  }) => {
    client.metadataUpdateCalls += 1;
    if (client.metadataUpdateCalls === client.failMetadataUpdateAt) {
      throw new Error('injected release metadata failure');
    }
    client.events.push(`retarget:${version}:${releaseSha}`);
    Object.assign(
      client.release,
      releaseMetadataUpdate({ environment, releaseSha, version })
    );
    return client.release;
  };
  client.retargetEmptyDraft = async (_id, releaseSha) => {
    client.release.target_commitish = releaseSha;
    return client.release;
  };
  client.updateTagCommit = async (_tag, releaseSha) => {
    client.tagUpdateCalls += 1;
    if (client.tagUpdateCalls === client.failTagUpdateAt) {
      throw new Error('injected tag update failure');
    }
    client.events.push(`update-tag:${releaseSha}`);
    client.tagSha = releaseSha;
  };
  client.currentMainSha = async () =>
    Array.isArray(client.mainSha) ? client.mainSha.shift() : client.mainSha;
  client.assertMainlineAncestor = async () => {
    await client.currentMainSha();
    if (!client.mainlineAncestor) {
      throw new Error(
        'Desktop generation is not a trusted ancestor of current main.'
      );
    }
  };
  client.assertCommitDescendant = async () => {
    if (!client.stagingAncestor) {
      throw new Error(
        'Desktop staging source would move backward or leave its published lineage.'
      );
    }
  };
  client.publishRelease = async (_id, environment) => {
    Object.assign(client.release, {
      draft: false,
      prerelease: environment === 'staging',
      published_at: '2026-08-30T00:00:00Z',
    });
    client.tagSha = client.release.target_commitish;
    return client.release;
  };
  client.resolveTagCommit = async () => client.tagSha;
  return client;
}

async function localRelease(t, environment, version) {
  const dir = await mkdtemp(join(tmpdir(), 'jovie-desktop-release-'));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const buffers = artifactBuffers(environment, version);
  await Promise.all(
    [...buffers].map(([name, buffer]) => writeFile(join(dir, name), buffer))
  );
  return { buffers, dir, output: join(dir, 'output.txt') };
}

const FLOOR = '26.8.1';
const OLD_SHA = 'a'.repeat(40);
const NEXT_SHA = 'b'.repeat(40);
const SUPER_SHA = 'c'.repeat(40);
const OLD_VERSION = '26.8.2-staging.17823456789.1';
const NEXT_VERSION = '26.8.2-staging.17823456790.1';
const SUPER_VERSION = '26.8.2-staging.17823456791.1';
const STALE_VERSION = '26.8.2-staging.17823456788.1';

function stagingClient({
  draft = false,
  mainSha = NEXT_SHA,
  mainlineAncestor = true,
  releaseSha = OLD_SHA,
  stagingAncestor = true,
} = {}) {
  return fakeClient({
    mainSha,
    mainlineAncestor,
    release: releaseFixture('staging', OLD_VERSION, releaseSha, draft),
    seedBuffers: artifactBuffers('staging', OLD_VERSION),
    stagingAncestor,
  });
}

function stagingArgs(client, releaseSha = NEXT_SHA, version = NEXT_VERSION) {
  return {
    client,
    environment: 'staging',
    installedVersion: FLOOR,
    releaseSha,
    version,
  };
}

function stagingInput(
  client,
  local,
  releaseSha = NEXT_SHA,
  version = NEXT_VERSION
) {
  return {
    ...stagingArgs(client, releaseSha, version),
    dist: local.dir,
    output: local.output,
  };
}

async function rollFixture(t, options) {
  const local = await localRelease(t, 'staging', NEXT_VERSION);
  const client = stagingClient(options);
  return { client, local, input: stagingInput(client, local) };
}

const identity = client => [
  client.tagSha,
  client.release.name,
  client.release.target_commitish,
];
const names = client => client.release.assets.map(asset => asset.name).sort();
const feedBytes = client =>
  client.downloadAsset(
    client.release.assets.find(asset => asset.name === 'staging-mac.yml')
  );
async function assertPublished(
  client,
  local,
  version,
  sha,
  retainedVersion = OLD_VERSION
) {
  const retained = expectedDesktopAssetNames(retainedVersion, 'staging').filter(
    name => name !== 'staging-mac.yml'
  );
  assert.deepEqual(
    names(client),
    [...expectedDesktopAssetNames(version, 'staging'), ...retained].sort()
  );
  assert.deepEqual(
    await feedBytes(client),
    local.buffers.get('staging-mac.yml')
  );
  assert.deepEqual(identity(client), [sha, version, sha]);
}

test('staging draft creation removes an owned starter and resumes', async t => {
  const client = fakeClient({ mainSha: OLD_SHA });
  const common = stagingArgs(client, OLD_SHA, OLD_VERSION);
  await prepare(common);
  assert.equal(client.release.tag_name, 'desktop-staging');
  assert.equal(client.release.draft, true);
  assert.deepEqual(client.release.assets, []);
  const local = await localRelease(t, 'staging', OLD_VERSION);
  const input = { ...common, dist: local.dir, output: local.output };
  const name = expectedDesktopAssetNames(OLD_VERSION, 'staging')[0];
  client.failUploadsRemaining.set(name, 1);
  await assert.rejects(uploadAndPublish(input), /injected .* upload failure/);
  assert.equal(
    client.release.assets.find(asset => asset.name === name).state,
    'starter'
  );
  await uploadAndPublish(input);
  assert.equal(client.events.includes(`delete:${name}`), true);
  assert.equal(client.release.assets.length, 5);
});

test('first staging publication remains valid when main advances', async t => {
  const client = fakeClient({ mainSha: [OLD_SHA, SUPER_SHA] });
  const local = await localRelease(t, 'staging', OLD_VERSION);
  const input = stagingInput(client, local, OLD_SHA, OLD_VERSION);
  await prepare(input);
  await uploadAndPublish(input);
  assert.deepEqual(identity(client), [OLD_SHA, OLD_VERSION, OLD_SHA]);
  assert.match(await readFile(local.output, 'utf8'), /release_sha=a{40}/);
});

test('staging prepare safely clears and retargets a prior-generation draft', async () => {
  const client = stagingClient({ draft: true, mainSha: NEXT_SHA });
  await prepare(stagingArgs(client));
  assert.equal(client.release.name, NEXT_VERSION);
  assert.equal(client.release.target_commitish, NEXT_SHA);
  assert.equal(client.release.assets.length, 0);
  assert.equal(
    client.events.filter(event => event.startsWith('delete:')).length,
    5
  );
});

test('stale draft cleanup never deletes an unowned uploaded or starter asset', async () => {
  for (const starter of [false, true]) {
    const client = stagingClient({ draft: true, mainSha: NEXT_SHA });
    starter
      ? client.seedStarter('unowned.txt')
      : client.seedAsset('unowned.txt', Buffer.from('keep me'));
    await assert.rejects(
      prepare(stagingArgs(client)),
      /Unexpected staging release asset/
    );
    assert.equal(
      client.events.some(event => event.startsWith('delete:')),
      false
    );
  }
});

test('staging proof rejects a stable envelope and wrong channel', () => {
  const client = stagingClient();
  const fixture = {
    buffers: artifactBuffers('staging', OLD_VERSION),
    environment: 'staging',
    release: client.release,
    releaseSha: OLD_SHA,
    version: OLD_VERSION,
    draft: false,
  };
  assert.doesNotThrow(() => validateReleaseAssets(fixture));
  client.release.prerelease = false;
  assert.throws(() => validateReleaseAssets(fixture), /prerelease state/);
  client.release.prerelease = true;
  fixture.buffers.delete('staging-mac.yml');
  assert.throws(
    () => validateReleaseAssets(fixture),
    /missing for staging-mac\.yml/
  );
});

test('published staging preflight rejects malformed, duplicate, and unrepairable state', async t => {
  const local = await localRelease(t, 'staging', NEXT_VERSION);
  const duplicate = expectedDesktopAssetNames(NEXT_VERSION, 'staging')[0];
  /** @type {Array<[(client: ReturnType<typeof stagingClient>) => void, RegExp]>} */
  const corruptions = [
    [client => (client.release.name = 'malformed'), /malformed provenance/],
    [
      client => {
        client.seedAsset(duplicate, local.buffers.get(duplicate));
        client.seedStarter(duplicate);
      },
      /Duplicate staging asset/,
    ],
  ];
  for (const [configure, error] of corruptions) {
    const client = stagingClient();
    configure(client);
    await assert.rejects(uploadAndPublish(stagingInput(client, local)), error);
    assert.deepEqual(client.events, []);
  }
});

test('published staging rolls binaries first, feed last, retains one rollback generation, and prunes older assets', async t => {
  const { client, input, local } = await rollFixture(t);
  for (const [name, buffer] of artifactBuffers('staging', STALE_VERSION)) {
    if (name !== 'staging-mac.yml') client.seedAsset(name, buffer);
  }
  await uploadAndPublish(input);
  const feedDelete = client.events.indexOf('delete:staging-mac.yml');
  const feedUpload = client.events.indexOf('upload:staging-mac.yml');
  const binaryUpload = client.events.reduce(
    (lastIndex, event, index) =>
      event.startsWith('upload:Jovie-Staging') ? index : lastIndex,
    -1
  );
  const tagUpdate = client.events.indexOf(`update-tag:${NEXT_SHA}`);
  const retarget = client.events.indexOf(
    `retarget:${NEXT_VERSION}:${NEXT_SHA}`
  );
  const staleAssetPrune = client.events.findIndex(event =>
    event.startsWith(`delete:Jovie-Staging-${STALE_VERSION}`)
  );
  assert.ok(
    binaryUpload < tagUpdate &&
      tagUpdate < retarget &&
      retarget < feedDelete &&
      feedDelete < feedUpload &&
      feedUpload < staleAssetPrune
  );
  await assertPublished(client, local, NEXT_VERSION, NEXT_SHA);
});

test('published staging remains valid when main advances during publication', async t => {
  const { client, input, local } = await rollFixture(t, {
    mainSha: [NEXT_SHA, 'c'.repeat(40)],
  });
  await uploadAndPublish(input);
  await assertPublished(client, local, NEXT_VERSION, NEXT_SHA);
  assert.match(await readFile(local.output, 'utf8'), /release_sha=b{40}/);
});

test('published staging rejects stale source before any release mutation', async t => {
  const client = fakeClient({
    mainSha: SUPER_SHA,
    release: releaseFixture('staging', NEXT_VERSION, NEXT_SHA, false),
    seedBuffers: artifactBuffers('staging', NEXT_VERSION),
    stagingAncestor: false,
  });
  const local = await localRelease(t, 'staging', SUPER_VERSION);
  await assert.rejects(
    uploadAndPublish(stagingInput(client, local, OLD_SHA, SUPER_VERSION)),
    /move backward or leave its published lineage/
  );
  assert.deepEqual(client.events, []);
  assert.deepEqual(identity(client), [NEXT_SHA, NEXT_VERSION, NEXT_SHA]);
  await assert.rejects(readFile(local.output), { code: 'ENOENT' });
});

test('partial staging uploads resume matching binaries and failed starters', async t => {
  const { client, input, local } = await rollFixture(t);
  const names = expectedDesktopAssetNames(NEXT_VERSION, 'staging');
  const [preloaded, failed] = names;
  client.seedAsset(preloaded, local.buffers.get(preloaded));
  client.failUploadsRemaining.set(failed, 1);
  await assert.rejects(uploadAndPublish(input), /injected .* upload failure/);
  assert.equal(
    client.release.assets.find(asset => asset.name === failed).state,
    'starter'
  );
  await uploadAndPublish(input);
  assert.equal(client.events.includes(`upload:${preloaded}`), false);
  assert.equal(client.events.includes(`delete:${failed}`), true);
});

test('published roll failures remain safe and rerunnable', async t => {
  const scenarios = [
    {
      label: 'tag update',
      failures: { failTagUpdateAt: 1 },
      error: /injected tag update/,
      terminal: 'old',
    },
    {
      label: 'metadata update',
      failures: { failMetadataUpdateAt: 1 },
      error: /injected release metadata/,
      terminal: 'old',
    },
    {
      label: 'metadata and tag rollback',
      failures: { failMetadataUpdateAt: 1, failTagUpdateAt: 2 },
      error: /metadata update and tag rollback both failed/,
      terminal: 'split',
    },
    {
      label: 'feed upload',
      failures: { failFeedUploadsRemaining: 1 },
      error: /feed upload failure/,
      terminal: 'old',
    },
    {
      label: 'feed and metadata rollback',
      failures: { failFeedUploadsRemaining: 1, failMetadataUpdateAt: 2 },
      error: /feed restored but metadata rollback failed/,
      terminal: 'newer',
    },
    {
      label: 'feed and tag rollback',
      failures: { failFeedUploadsRemaining: 1, failTagUpdateAt: 2 },
      error: /feed restored but tag rollback failed/,
      terminal: 'split-newer',
    },
    {
      label: 'feed and rollback upload',
      failures: { failFeedUploadsRemaining: 2 },
      error: /feed upload and rollback both failed/,
      terminal: 'starter',
    },
    {
      label: 'old feed delete',
      failures: { failDeleteName: 'staging-mac.yml' },
      error: /staging-mac\.yml delete failure/,
      terminal: 'new',
    },
    {
      label: 'stale binary prune',
      failures: {
        failDeleteName: `Jovie-Staging-${STALE_VERSION}-universal.dmg`,
      },
      error: /stale binary prune|delete failure/,
      terminal: 'published',
    },
  ];
  for (const { label, failures, error, terminal } of scenarios) {
    await t.test(label, async t => {
      const { client, input, local } = await rollFixture(t);
      if (label === 'stale binary prune') {
        for (const [name, buffer] of artifactBuffers(
          'staging',
          STALE_VERSION
        )) {
          if (name !== 'staging-mac.yml') client.seedAsset(name, buffer);
        }
      }
      Object.assign(client, failures);
      await assert.rejects(uploadAndPublish(input), error);
      if (terminal === 'starter') {
        const poisoned = client.release.assets.find(
          asset => asset.name === 'staging-mac.yml'
        );
        assert.deepEqual(
          [poisoned.state, poisoned.size, poisoned.digest],
          ['starter', 0, null]
        );
        assert.equal(await client.downloadAsset(poisoned), undefined);
      } else {
        assert.deepEqual(
          await feedBytes(client),
          terminal === 'published'
            ? local.buffers.get('staging-mac.yml')
            : artifactBuffers('staging', OLD_VERSION).get('staging-mac.yml')
        );
      }
      await assert.rejects(readFile(local.output), { code: 'ENOENT' });
      assert.deepEqual(
        identity(client),
        terminal === 'old'
          ? [OLD_SHA, OLD_VERSION, OLD_SHA]
          : terminal.startsWith('split')
            ? [NEXT_SHA, OLD_VERSION, OLD_SHA]
            : [NEXT_SHA, NEXT_VERSION, NEXT_SHA]
      );
      if (label === 'feed upload') {
        assert.equal(
          client.events.filter(event => event === 'delete:staging-mac.yml')
            .length,
          2
        );
      }
      let retry = { input, local, sha: NEXT_SHA, version: NEXT_VERSION };
      if (terminal.startsWith('split')) {
        const before = [identity(client), names(client), client.events.length];
        await assert.rejects(uploadAndPublish(input), /malformed provenance/);
        assert.deepEqual(
          [identity(client), names(client), client.events.length],
          before
        );
        client.tagSha = client.release.target_commitish;
      }
      if (terminal === 'newer') {
        const before = [identity(client), names(client), client.events.length];
        const older = await localRelease(t, 'staging', OLD_VERSION);
        await assert.rejects(
          uploadAndPublish(stagingInput(client, older, OLD_SHA, OLD_VERSION)),
          /not newer than current feed/
        );
        assert.deepEqual(
          [identity(client), names(client), client.events.length],
          before
        );
        const newer = await localRelease(t, 'staging', SUPER_VERSION);
        client.mainSha = SUPER_SHA;
        retry = {
          input: stagingInput(client, newer, SUPER_SHA, SUPER_VERSION),
          local: newer,
          sha: SUPER_SHA,
          version: SUPER_VERSION,
        };
      }
      await uploadAndPublish(retry.input);
      await assertPublished(
        client,
        retry.local,
        retry.version,
        retry.sha,
        OLD_VERSION
      );
    });
  }
});

function productionRecoveryFixture() {
  const releaseSha = '43414c7da0e53f1b47cda7e562c2b43de4c386f7';
  const version = '26.10.0';
  const orphan = {
    ...releaseFixture('production', version, releaseSha),
    id: 401449487,
    tag_name: 'untagged-4342acff1e28ec4b6d16',
  };
  const client = fakeClient({ mainSha: releaseSha, release: orphan });
  client.recoverableProductionDraft = async input => {
    assert.deepEqual(input, { releaseSha, version });
    return structuredClone(orphan);
  };
  client.createDraft = async () => assert.fail('must reuse the existing draft');
  client.retargetEmptyDraft = async () => assert.fail('must not retarget');
  return {
    client,
    orphan,
    input: {
      client,
      environment: 'production',
      installedVersion: version,
      releaseSha,
      version,
    },
  };
}

test('production prepare recovers the authorized placeholder draft without creating or retargeting', async () => {
  const { client, orphan, input } = productionRecoveryFixture();
  const { releaseSha, version } = input;
  const calls = [];
  client.releaseById = async id => {
    calls.push(id);
    return structuredClone(client.release);
  };
  const update = client.updateReleaseMetadata;
  client.updateReleaseMetadata = async input => {
    assert.deepEqual(calls, [orphan.id], 'fresh read must precede mutation');
    assert.equal(input.releaseId, orphan.id);
    return update(input);
  };

  await prepare(input);

  assert.deepEqual(calls, [orphan.id, orphan.id]);
  assert.equal(client.metadataUpdateCalls, 1);
  assert.equal(client.release.id, orphan.id);
  assert.equal(client.release.tag_name, `v${version}`);
  assert.equal(client.release.target_commitish, releaseSha);
  assert.equal(client.release.draft, true);
  assert.deepEqual(client.release.assets, []);
  assert.deepEqual(client.events, [`retarget:${version}:${releaseSha}`]);
});

test('production recovery revalidates a fresh same-ID private empty authorized draft before mutation', async () => {
  for (const changed of [
    null,
    { id: 401449488 },
    { tag_name: 'v26.10.0' },
    { name: '26.9.16' },
    { target_commitish: OLD_SHA },
    { draft: false },
    { prerelease: true },
    { published_at: '2026-10-02T00:00:00Z' },
    { assets: null },
    { assets: [{ id: 1 }] },
  ]) {
    const { client, orphan, input } = productionRecoveryFixture();
    client.releaseById = async () => changed && { ...orphan, ...changed };
    await assert.rejects(prepare(input), /production/);
    assert.equal(client.metadataUpdateCalls, 0);
    assert.deepEqual(client.events, []);
  }
});

test('production recovery requires strict same-ID exact-tag private empty readback after normalization', async () => {
  for (const changed of [
    null,
    { id: 401449488 },
    { tag_name: 'untagged-4342acff1e28ec4b6d16' },
    { name: '26.9.16' },
    { target_commitish: OLD_SHA },
    { draft: false },
    { prerelease: true },
    { published_at: '2026-10-02T00:00:00Z' },
    { assets: null },
    { assets: [{ id: 1 }] },
  ]) {
    const { client, orphan, input } = productionRecoveryFixture();
    let reads = 0;
    client.releaseById = async () => {
      reads += 1;
      return reads === 1
        ? structuredClone(orphan)
        : changed && { ...client.release, ...changed };
    };
    await assert.rejects(prepare(input), /production|Release|release/);
    assert.equal(client.metadataUpdateCalls, 1);
    assert.equal(reads, 2);
    assert.deepEqual(client.events, [
      `retarget:${input.version}:${input.releaseSha}`,
    ]);
  }
});

test('production prepare preserves exact-tag drafts from older sources and skips recovery for exact matches', async () => {
  const { input } = productionRecoveryFixture();
  const client = fakeClient({
    mainSha: input.releaseSha,
    release: releaseFixture('production', input.version, OLD_SHA),
  });
  client.recoverableProductionDraft = async () =>
    assert.fail('tag already exists');
  client.retargetEmptyDraft = async () =>
    assert.fail('must not retarget older source');
  const before = structuredClone(client.release);
  await assert.rejects(
    prepare({ ...input, client }),
    /not the authorized commit/
  );
  assert.deepEqual(client.release, before);
  client.release.target_commitish = input.releaseSha;
  await prepare({ ...input, client });
  assert.equal(client.metadataUpdateCalls, 0);
  assert.deepEqual(client.events, []);
});

test('production keeps immutable version tags and never uses rolling mutations', async t => {
  const releaseSha = 'c'.repeat(40);
  const version = '26.8.1';
  const local = await localRelease(t, 'production', version);
  const client = fakeClient({ mainSha: releaseSha });
  const common = {
    client,
    environment: 'production',
    installedVersion: version,
    releaseSha,
    version,
  };
  const malformed = fakeClient({
    mainSha: releaseSha,
    release: releaseFixture('production', 'wrong', OLD_SHA),
  });
  malformed.release.tag_name = `v${version}`;
  malformed.release.prerelease = true;
  await assert.rejects(
    prepare({ ...common, client: malformed }),
    /title is not exact/
  );
  assert.deepEqual(
    [malformed.release.name, malformed.release.prerelease],
    ['wrong', true]
  );
  const blocked = fakeClient({ mainSha: releaseSha });
  await prepare({ ...common, client: blocked });
  blocked.seedStarter(expectedDesktopAssetNames(version)[0]);
  await assert.rejects(
    uploadAndPublish({
      ...common,
      client: blocked,
      dist: local.dir,
      output: local.output,
    }),
    /not uploaded/
  );
  assert.equal(
    blocked.events.some(event => event.startsWith('delete:')),
    false
  );
  await prepare(common);
  await uploadAndPublish({
    ...common,
    dist: local.dir,
    output: local.output,
  });
  assert.equal(client.release.tag_name, `v${version}`);
  assert.equal(client.release.prerelease, false);
  assert.equal(
    client.events.some(
      event => event.startsWith('delete:') || event.startsWith('update-tag:')
    ),
    false
  );
});

test('production publishes forward-only when main advances past the verified generation', async t => {
  const releaseSha = 'c'.repeat(40);
  const version = '26.8.1';
  const local = await localRelease(t, 'production', version);
  const common = {
    environment: 'production',
    installedVersion: version,
    releaseSha,
    version,
  };

  const advanced = fakeClient({ mainSha: [releaseSha, SUPER_SHA] });
  await prepare({ ...common, client: advanced });
  await uploadAndPublish({
    ...common,
    client: advanced,
    dist: local.dir,
    output: local.output,
  });
  assert.equal(advanced.release.draft, false);
  assert.equal(advanced.release.tag_name, `v${version}`);
  assert.match(await readFile(local.output, 'utf8'), /release_sha=c{40}/);

  const diverged = fakeClient({
    mainSha: [releaseSha, SUPER_SHA],
    mainlineAncestor: false,
  });
  await prepare({ ...common, client: diverged });
  await assert.rejects(
    uploadAndPublish({
      ...common,
      client: diverged,
      dist: local.dir,
      output: local.output,
    }),
    /not a trusted ancestor/
  );
  assert.equal(diverged.release.draft, true);
});

const INSTALLATION_QUOTA =
  '{"message":"API rate limit exceeded for installation"}';

function quotaResponse(status, body, headers = {}) {
  return new Response(body, { status, headers });
}

test('release-asset read holds an installation 403 until x-ratelimit-reset', () => {
  const nowMs = 1_700_000_000_000;
  const reset = Math.floor(nowMs / 1000) + 30;
  const headers = {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String(reset),
  };
  const waitMs = planReleaseAssetReadHold({
    attempt: 1,
    body: INSTALLATION_QUOTA,
    deadlineMs: nowMs + RELEASE_ASSET_READ_MAX_WAIT_MS,
    headers,
    nowMs,
    status: 403,
  });
  assert.equal(waitMs, reset * 1000 + 1000 - nowMs);
  assert.equal(
    planReleaseAssetReadHold({
      attempt: 1,
      body: '{"message":"Resource not accessible by integration"}',
      deadlineMs: nowMs + RELEASE_ASSET_READ_MAX_WAIT_MS,
      headers: { 'x-ratelimit-remaining': '0' },
      nowMs,
      status: 403,
    }),
    null
  );
  assert.equal(
    planReleaseAssetReadHold({
      attempt: 1,
      body: INSTALLATION_QUOTA,
      deadlineMs: nowMs + RELEASE_ASSET_READ_MAX_WAIT_MS,
      headers: null,
      nowMs,
      status: 403,
    }),
    null
  );
  assert.equal(
    planReleaseAssetReadHold({
      attempt: 1,
      body: INSTALLATION_QUOTA,
      deadlineMs: nowMs + RELEASE_ASSET_READ_MAX_WAIT_MS,
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(Math.floor(nowMs / 1000) + 3600),
      },
      nowMs,
      status: 403,
    }),
    null
  );
  assert.equal(
    planReleaseAssetReadHold({
      attempt: RELEASE_ASSET_READ_ATTEMPTS,
      body: INSTALLATION_QUOTA,
      deadlineMs: nowMs + RELEASE_ASSET_READ_MAX_WAIT_MS,
      headers,
      nowMs,
      status: 403,
    }),
    null
  );
  assert.equal(RELEASE_ASSET_READ_ATTEMPTS, 4);
  assert.equal(RELEASE_ASSET_READ_MAX_WAIT_MS, 600_000);
  assert.equal(
    planReleaseAssetReadHold({
      attempt: 1,
      deadlineMs: nowMs + RELEASE_ASSET_READ_MAX_WAIT_MS,
      nowMs,
    }),
    null
  );
});

test('production prepare defers a known quota reset beyond budget without claiming publication', async t => {
  const root = await mkdtemp(join(tmpdir(), 'jovie-desktop-prepare-quota-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const releaseSha = 'c'.repeat(40);
  const version = '26.10.9';
  const release = {
    ...releaseFixture('production', version, releaseSha),
    assets: [],
  };
  await writeFile(join(root, 'VERSION'), `${version}\n`);
  const preload = join(root, 'github.mjs');
  await writeFile(
    preload,
    `import { appendFileSync } from 'node:fs';
let now = 1700000000000;
Date.now = () => now;
globalThis.setTimeout = (callback, ms) => {
  appendFileSync('sleeps', String(ms) + '\\n');
  now += ms;
  callback();
  return 0;
};
let calls = 0;
globalThis.fetch = async (url, options) => {
  calls += 1;
  const mode = process.env.MOCK_MODE;
  const method = options.method || 'GET';
  appendFileSync('calls', method + ' ' + new URL(url).pathname + '\\n');
  if (mode === 'mutation' && method === 'GET') {
    return new Response(url.includes('/tags/') ? '{}' : '[]', {
      status: url.includes('/tags/') ? 404 : 200,
    });
  }
  if (mode === 'success' || (mode === 'retry' && calls > 1)) {
    return Response.json(${JSON.stringify(release)});
  }
  const headers = mode === 'missing-reset' ? {} : {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': String(now / 1000 + (mode === 'retry' || mode === 'attempt-cap' ? 30 : 3600)),
  };
  return new Response(JSON.stringify({ message: mode === 'permission'
    ? 'Resource not accessible by integration' : 'API rate limit exceeded for installation' }),
    { status: 403, headers });
};
`
  );
  for (const scenario of [
    { mode: 'outside-budget', code: 0, prepared: 'false' },
    { mode: 'retry', code: 0, prepared: 'true' },
    { mode: 'success', code: 0, prepared: 'true' },
    { mode: 'permission', code: 1 },
    { mode: 'missing-reset', code: 1 },
    { mode: 'attempt-cap', code: 1 },
    { mode: 'mutation', code: 1 },
    { mode: 'outside-budget', code: 1, environment: 'staging' },
    { mode: 'outside-budget', code: 1, command: 'upload-and-publish' },
    { mode: 'outside-budget', code: 1, command: 'verify-published' },
  ]) {
    for (const file of ['outputs', 'summary', 'calls', 'sleeps']) {
      await writeFile(join(root, file), '');
    }
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        preload,
        new URL('./desktop-release-assets.mjs', import.meta.url).pathname,
        scenario.command || 'prepare',
        '--repository',
        'JovieInc/Jovie',
        '--sha',
        releaseSha,
        '--environment',
        scenario.environment || 'production',
        '--version',
        scenario.environment ? `${version}-staging.1.1` : version,
        '--dist',
        root,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_TOKEN: 'test-token',
          GITHUB_OUTPUT: join(root, 'outputs'),
          GITHUB_STEP_SUMMARY: join(root, 'summary'),
          MOCK_MODE: scenario.mode,
        },
      }
    );
    const label = JSON.stringify(scenario);
    assert.equal(result.status, scenario.code, `${label}: ${result.stderr}`);
    const outputs = await readFile(join(root, 'outputs'), 'utf8');
    const summary = await readFile(join(root, 'summary'), 'utf8');
    const calls = await readFile(join(root, 'calls'), 'utf8');
    const sleeps = await readFile(join(root, 'sleeps'), 'utf8');
    assert.doesNotMatch(outputs, /published_sha|publisher_attempt|release_sha/);
    if (scenario.prepared) {
      const prepared = outputs
        .trim()
        .split('\n')
        .filter(line => line.startsWith('prepared='))
        .at(-1);
      assert.equal(prepared, `prepared=${scenario.prepared}`, label);
    }
    if (scenario.prepared === 'false') {
      assert.match(result.stderr, /github-quota-deferred/);
      assert.match(summary, /2023-11-14T23:13:21.000Z/);
      assert.ok(summary.includes(releaseSha), summary);
      assert.match(summary, /No desktop release was published/);
      assert.equal(calls.trim().split('\n').length, 1);
      assert.equal(sleeps, '');
    } else {
      assert.equal(summary, '', label);
      assert.doesNotMatch(result.stderr, /github-quota-deferred/, label);
    }
    if (scenario.mode === 'retry') {
      assert.equal(calls.trim().split('\n').length, 2);
      assert.equal(sleeps, '31000\n');
    }
    if (scenario.mode === 'mutation') {
      assert.match(calls, /POST .*\/releases/);
      assert.equal(sleeps, '');
    }
    if (scenario.mode === 'attempt-cap') {
      assert.equal(calls.trim().split('\n').length, 4);
    }
    if (scenario.mode === 'missing-reset') {
      assert.match(result.stderr, /x-ratelimit-reset=missing/);
    }
  }
});

test('existing release tag read survives one installation 403 and does not create another draft', async () => {
  const releaseSha = 'c'.repeat(40);
  const version = '26.10.5';
  const nowMs = 1_700_000_000_000;
  const reset = Math.floor(nowMs / 1000) + 30;
  const release = {
    ...releaseFixture('production', version, releaseSha),
    assets: [],
  };
  const calls = [];
  const sleeps = [];
  const fetchImpl = async url => {
    calls.push(String(url));
    if (calls.length === 1) {
      return quotaResponse(403, INSTALLATION_QUOTA, {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': String(reset),
      });
    }
    return quotaResponse(200, JSON.stringify(release));
  };
  const client = new GitHubClient({
    repository: 'JovieInc/Jovie',
    token: 'test-token',
    fetchImpl,
    now: () => nowMs,
    sleep: async ms => {
      sleeps.push(ms);
    },
    log: () => {},
  });

  const found = await client.releaseByTag(`v${version}`, true);
  assert.equal(found.id, release.id);
  assert.equal(found.target_commitish, releaseSha);
  assert.deepEqual(
    calls.map(url => url.endsWith(`/releases/tags/v${version}`)),
    [true, true]
  );
  assert.deepEqual(sleeps, [reset * 1000 + 1000 - nowMs]);

  client.releaseOrDraftByTag = async () => found;
  client.createDraft = async () => {
    throw new Error('must not create a second draft');
  };
  await prepare({
    client,
    environment: 'production',
    installedVersion: version,
    releaseSha,
    version,
  });
});

test('release-asset read fails closed on permission, exhausted budget, mutations, and a missing release', async () => {
  const nowMs = 1_700_000_000_000;
  const reset = Math.floor(nowMs / 1000) + 30;
  const cases = [
    {
      label: 'permission 403',
      responses: [
        quotaResponse(
          403,
          '{"message":"Resource not accessible by integration"}'
        ),
      ],
      method: 'GET',
      error: /failed \(403\)/,
    },
    {
      label: 'reset outside the existing budget',
      responses: [
        quotaResponse(403, INSTALLATION_QUOTA, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(Math.floor(nowMs / 1000) + 3600),
        }),
      ],
      method: 'GET',
      error: /beyond the release read budget/,
    },
    {
      label: 'installation 403 without x-ratelimit-reset',
      responses: [quotaResponse(403, INSTALLATION_QUOTA)],
      method: 'GET',
      error: /failed \(403\)/,
    },
    {
      label: 'mutation is not retried',
      responses: [
        quotaResponse(403, INSTALLATION_QUOTA, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        }),
      ],
      method: 'POST',
      error: /POST /,
    },
    {
      label: 'attempt cap stays fatal',
      responses: Array.from({ length: RELEASE_ASSET_READ_ATTEMPTS }, () =>
        quotaResponse(403, INSTALLATION_QUOTA, {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        })
      ),
      method: 'GET',
      error: /failed \(403\)/,
    },
  ];

  for (const scenario of cases) {
    let index = 0;
    const sleeps = [];
    const client = new GitHubClient({
      repository: 'JovieInc/Jovie',
      token: 'test-token',
      fetchImpl: async () => {
        const response = scenario.responses[index];
        index += 1;
        if (!response)
          throw new Error(`${scenario.label} fetched past its script`);
        return response.clone();
      },
      now: () => nowMs,
      sleep: async ms => {
        sleeps.push(ms);
      },
      log: () => {},
    });
    await assert.rejects(
      client.request('/repos/JovieInc/Jovie/releases/tags/v26.10.5', {
        method: scenario.method,
      }),
      scenario.error,
      scenario.label
    );
    assert.equal(
      index,
      scenario.responses.length,
      `${scenario.label} call count`
    );
    if (scenario.label === 'attempt cap stays fatal') {
      assert.equal(sleeps.length, RELEASE_ASSET_READ_ATTEMPTS - 1);
    } else {
      assert.deepEqual(sleeps, [], scenario.label);
    }
  }

  const missing = new GitHubClient({
    repository: 'JovieInc/Jovie',
    token: 'test-token',
    fetchImpl: async url =>
      String(url).includes('/releases/tags/')
        ? quotaResponse(404, '{"message":"Not Found"}')
        : quotaResponse(200, '[]'),
    now: () => nowMs,
    log: () => {},
  });
  assert.equal(await missing.releaseByTag('v26.10.5', true), null);
  await assert.rejects(
    missing.releaseOrDraftByTag('v26.10.5'),
    /Release not found: v26.10.5/
  );

  const defaults = new GitHubClient({
    repository: 'JovieInc/Jovie',
    token: 'test-token',
    fetchImpl: async url => {
      if (String(url).endsWith('/empty'))
        return new Response(null, { status: 204 });
      if (String(url).startsWith('https://uploads.example/asset')) {
        return new Response(Uint8Array.from([1, 2, 3]));
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  await defaults.sleep(0);
  defaults.log('release read defaults stay on the installation-quota path');
  assert.equal(await defaults.request('https://uploads.example/empty'), null);
  assert.deepEqual(
    [
      ...(await defaults.request('https://uploads.example/asset', {
        raw: true,
      })),
    ],
    [1, 2, 3]
  );
});

test('parseArgs accepts equals-form values without consuming the next token', () => {
  const { args, command } = parseArgs([
    'upload-and-publish',
    '--environment',
    'staging',
    '--sha',
    NEXT_SHA,
    '--version=26.8.2-staging.17823456790.1',
    '--dist',
    'apps/desktop/dist',
  ]);
  assert.equal(command, 'upload-and-publish');
  assert.deepEqual(args, {
    environment: 'staging',
    sha: NEXT_SHA,
    version: '26.8.2-staging.17823456790.1',
    dist: 'apps/desktop/dist',
  });
});
