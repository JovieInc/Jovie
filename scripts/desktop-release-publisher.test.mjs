import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  expectedDesktopAssetNames,
  prepare,
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

function fakeClient({ mainSha, release = null, seedBuffers = new Map() }) {
  const client = {
    buffers: new Map(),
    events: [],
    failDeleteName: null,
    failFeedUploadsRemaining: 0,
    failMetadataUpdateAt: 0,
    failTagUpdateAt: 0,
    failUploadsRemaining: new Map(),
    mainSha,
    metadataUpdateCalls: 0,
    nextAssetId: 1,
    release,
    tagSha: release?.target_commitish || null,
    tagUpdateCalls: 0,
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
  client.updateReleaseMetadata = async ({ releaseSha, version }) => {
    client.metadataUpdateCalls += 1;
    if (client.metadataUpdateCalls === client.failMetadataUpdateAt) {
      throw new Error('injected release metadata failure');
    }
    client.events.push(`retarget:${version}:${releaseSha}`);
    Object.assign(client.release, {
      name: version,
      target_commitish: releaseSha,
    });
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
  releaseSha = OLD_SHA,
} = {}) {
  return fakeClient({
    mainSha,
    release: releaseFixture('staging', OLD_VERSION, releaseSha, draft),
    seedBuffers: artifactBuffers('staging', OLD_VERSION),
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

test('first staging publication emits no receipt after main advances', async t => {
  const client = fakeClient({ mainSha: [OLD_SHA, SUPER_SHA] });
  const local = await localRelease(t, 'staging', OLD_VERSION);
  const input = stagingInput(client, local, OLD_SHA, OLD_VERSION);
  await prepare(input);
  await assert.rejects(
    uploadAndPublish(input),
    /superseded before release receipt/
  );
  await assert.rejects(readFile(local.output), { code: 'ENOENT' });
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

test('staging emits no receipt when main advances during publication', async t => {
  const { input, local } = await rollFixture(t, {
    mainSha: [NEXT_SHA, 'c'.repeat(40)],
  });
  await assert.rejects(
    uploadAndPublish(input),
    /superseded before release receipt/
  );
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
  /** @type {Array<[string, Record<string, unknown>, RegExp, string]>} */
  const scenarios = [
    ['tag update', { failTagUpdateAt: 1 }, /injected tag update/, 'old'],
    [
      'metadata update',
      { failMetadataUpdateAt: 1, tagSha: SUPER_SHA },
      /injected release metadata/,
      'mirror',
    ],
    [
      'metadata and tag rollback',
      { failMetadataUpdateAt: 1, failTagUpdateAt: 2 },
      /metadata update and tag rollback both failed/,
      'split',
    ],
    [
      'feed upload',
      { failFeedUploadsRemaining: 1 },
      /feed upload failure/,
      'old',
    ],
    [
      'feed and metadata rollback',
      { failFeedUploadsRemaining: 1, failMetadataUpdateAt: 2 },
      /feed restored but metadata rollback failed/,
      'newer',
    ],
    [
      'feed and tag rollback',
      { failFeedUploadsRemaining: 1, failTagUpdateAt: 2 },
      /feed restored but tag rollback failed/,
      'split-newer',
    ],
    [
      'feed and rollback upload',
      { failFeedUploadsRemaining: 2 },
      /feed upload and rollback both failed/,
      'starter',
    ],
    [
      'old feed delete',
      { failDeleteName: 'staging-mac.yml' },
      /staging-mac\.yml delete failure/,
      'new',
    ],
    [
      'stale binary prune',
      {
        failDeleteName: `Jovie-Staging-${STALE_VERSION}-universal.dmg`,
      },
      /stale binary prune|delete failure/,
      'published',
    ],
  ];
  for (const [label, failures, error, terminal] of scenarios) {
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
          : terminal === 'mirror'
            ? [SUPER_SHA, OLD_VERSION, OLD_SHA]
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
      if (terminal.endsWith('newer')) {
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
