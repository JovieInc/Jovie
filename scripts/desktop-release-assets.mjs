#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_VERSION = '2022-11-28';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const STAGING_SEMVER_PATTERN =
  /^([0-9]+)\.([0-9]+)\.([0-9]+)-staging\.([1-9][0-9]*)\.([1-9][0-9]*)$/;
const STAGING_ASSET_PATTERN =
  /^Jovie-Staging-([0-9]+\.[0-9]+\.[0-9]+-staging\.[1-9][0-9]*\.[1-9][0-9]*)-universal\.(?:dmg|zip)(?:\.blockmap)?$/;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BASE64_SHA512_PATTERN = /^[A-Za-z0-9+/]{86}==$/;

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index];
    const value = rest[index + 1];
    invariant(name?.startsWith('--') && value, `Malformed argument: ${name}`);
    args[name.slice(2)] = value;
  }
  return { args, command };
}

function scalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function releaseSpec(environment, version) {
  const staging = environment === 'staging';
  invariant(
    environment === 'production' || staging,
    'Desktop release environment is invalid.'
  );
  invariant(
    (staging ? STAGING_SEMVER_PATTERN : SEMVER_PATTERN).test(version),
    staging
      ? 'Staging desktop version is not valid prerelease semver.'
      : 'Desktop version is not valid semver.'
  );
  return {
    artifactPrefix: `Jovie${staging ? '-Staging' : ''}-${version}-universal`,
    channelFile: staging ? 'staging-mac.yml' : 'latest-mac.yml',
    makeLatest: String(!staging),
    prerelease: staging,
    tag: staging ? 'desktop-staging' : `v${version}`,
  };
}

export function expectedDesktopAssetNames(version, environment = 'production') {
  const spec = releaseSpec(environment, version);
  return [
    `${spec.artifactPrefix}.dmg`,
    `${spec.artifactPrefix}.dmg.blockmap`,
    `${spec.artifactPrefix}.zip`,
    `${spec.artifactPrefix}.zip.blockmap`,
    spec.channelFile,
  ];
}

function stagingVersionTuple(version) {
  const match = STAGING_SEMVER_PATTERN.exec(version);
  invariant(match, 'Staging desktop version is not valid prerelease semver.');
  return match.slice(1).map(BigInt);
}

function compareTuples(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

export function assertStagingVersionTransition({
  currentFeedVersion,
  installedVersion,
  version,
}) {
  invariant(
    SEMVER_PATTERN.test(installedVersion),
    'Installed desktop floor is not valid stable semver.'
  );
  const next = stagingVersionTuple(version);
  const installedCore = installedVersion.split('.').map(BigInt);
  invariant(
    next[0] === installedCore[0] &&
      next[1] === installedCore[1] &&
      next[2] === installedCore[2] + 1n,
    `Staging desktop version ${version} is not the next-patch upgrade from ${installedVersion}.`
  );
  if (currentFeedVersion) {
    invariant(
      compareTuples(next, stagingVersionTuple(currentFeedVersion)) > 0n,
      `Staging desktop version ${version} is not newer than current feed ${currentFeedVersion}.`
    );
  }
}

export function parseLatestMacYaml(contents) {
  invariant(typeof contents === 'string', 'Updater metadata must be text.');
  const metadata = { files: [] };
  let inFiles = false;
  let currentFile = null;

  for (const rawLine of contents.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) {
      continue;
    }

    const topLevel = rawLine.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/);
    if (topLevel) {
      const [, key, value = ''] = topLevel;
      inFiles = key === 'files';
      currentFile = null;
      if (!inFiles) {
        metadata[key] = scalar(value);
      }
      continue;
    }

    if (!inFiles) {
      continue;
    }

    const fileStart = rawLine.match(/^\s+-\s+url:\s*(.+)$/);
    if (fileStart) {
      currentFile = { url: scalar(fileStart[1]) };
      metadata.files.push(currentFile);
      continue;
    }

    const fileProperty = rawLine.match(
      /^\s+(sha512|size):\s*(\S(?:.*\S)?)\s*$/
    );
    if (currentFile && fileProperty) {
      currentFile[fileProperty[1]] = scalar(fileProperty[2]);
    }
  }

  return metadata;
}

function sha(buffer, algorithm, encoding) {
  return createHash(algorithm).update(buffer).digest(encoding);
}

function normalizeAssetIdentity(asset) {
  invariant(
    Number.isInteger(asset?.id) && asset.id > 0,
    'Release asset ID is malformed.'
  );
  invariant(
    typeof asset.name === 'string' && asset.name.length > 0,
    'Release asset name is malformed.'
  );
  return asset;
}

function normalizeReleaseAsset(asset) {
  normalizeAssetIdentity(asset);
  invariant(asset.state === 'uploaded', `Asset ${asset.name} is not uploaded.`);
  invariant(
    Number.isInteger(asset.size) && asset.size > 0,
    `Asset ${asset.name} is empty.`
  );
  invariant(
    SHA256_DIGEST_PATTERN.test(asset.digest),
    `Asset ${asset.name} has no server SHA-256 digest.`
  );
  invariant(
    typeof asset.url === 'string' && asset.url.startsWith('https://'),
    `Asset ${asset.name} has no API download URL.`
  );
  return asset;
}

async function removeStagingStarterAssets(client, release) {
  const names = new Set();
  const starters = release.assets
    .map(rawAsset => {
      const asset = normalizeAssetIdentity(rawAsset);
      invariant(
        isStagingAssetName(asset.name),
        `Unexpected staging release asset: ${asset.name}`
      );
      invariant(
        !names.has(asset.name),
        `Duplicate staging asset: ${asset.name}`
      );
      names.add(asset.name);
      if (asset.state !== 'starter') {
        normalizeReleaseAsset(asset);
        return null;
      }
      invariant(
        asset.size === 0 && !SHA256_DIGEST_PATTERN.test(asset.digest || ''),
        `Incomplete staging asset is malformed: ${asset.name}`
      );
      return asset;
    })
    .filter(Boolean);
  for (const asset of starters) await client.deleteAsset(asset.id);
  return starters.length ? client.releaseById(release.id) : release;
}

export function isStagingAssetName(name) {
  return name === 'staging-mac.yml' || STAGING_ASSET_PATTERN.test(name || '');
}

export function validateReleaseEnvelope({
  environment = 'production',
  release,
  releaseSha,
  version,
  draft,
}) {
  const spec = releaseSpec(environment, version);
  invariant(
    Number.isInteger(release?.id) && release.id > 0,
    'GitHub release ID is malformed.'
  );
  invariant(release.tag_name === spec.tag, 'Release tag is not exact.');
  invariant(release.name === version, 'Release title is not exact.');
  invariant(
    release.target_commitish === releaseSha,
    'Release target is not the authorized commit.'
  );
  invariant(
    release.draft === draft,
    draft
      ? 'Desktop release must remain private while assets upload.'
      : 'Desktop release is not published.'
  );
  invariant(
    release.prerelease === spec.prerelease,
    'Desktop release prerelease state is not exact.'
  );
  invariant(Array.isArray(release.assets), 'Release assets are malformed.');
  if (!draft) {
    invariant(
      typeof release.published_at === 'string' &&
        release.published_at.length > 0,
      'Published release has no publication timestamp.'
    );
  }
}

export function validateUpdaterMetadata({
  buffers,
  environment = 'production',
  metadata,
  version,
}) {
  const spec = releaseSpec(environment, version);
  const dmgName = `${spec.artifactPrefix}.dmg`;
  const zipName = `${spec.artifactPrefix}.zip`;

  invariant(metadata.version === version, 'Updater version is not exact.');
  invariant(metadata.path === zipName, 'Updater path does not target the ZIP.');
  invariant(
    BASE64_SHA512_PATTERN.test(metadata.sha512),
    'Updater root SHA-512 is malformed.'
  );
  invariant(
    metadata.files.length === 2,
    'Updater metadata must describe exactly DMG and ZIP.'
  );

  const files = new Map();
  for (const file of metadata.files) {
    invariant(
      file &&
        typeof file.url === 'string' &&
        !files.has(file.url) &&
        (file.url === dmgName || file.url === zipName),
      'Updater metadata has a duplicate or unexpected file.'
    );
    invariant(
      BASE64_SHA512_PATTERN.test(file.sha512),
      `Updater SHA-512 is malformed for ${file.url}.`
    );
    invariant(
      /^[1-9][0-9]*$/.test(file.size),
      `Updater size is malformed for ${file.url}.`
    );
    files.set(file.url, file);
  }

  for (const name of [dmgName, zipName]) {
    const buffer = buffers.get(name);
    const file = files.get(name);
    invariant(
      Buffer.isBuffer(buffer),
      `Artifact bytes are missing for ${name}.`
    );
    invariant(file, `Updater metadata is missing ${name}.`);
    invariant(
      Number(file.size) === buffer.length,
      `Updater size does not match ${name}.`
    );
    invariant(
      file.sha512 === sha(buffer, 'sha512', 'base64'),
      `Updater SHA-512 does not match ${name}.`
    );
  }

  invariant(
    metadata.sha512 === files.get(zipName).sha512,
    'Updater root SHA-512 does not match the ZIP.'
  );
}

export function validateReleaseAssets({
  buffers,
  environment = 'production',
  extraAssetNames = new Set(),
  release,
  releaseSha,
  version,
  draft,
}) {
  const spec = releaseSpec(environment, version);
  validateReleaseEnvelope({
    environment,
    release,
    releaseSha,
    version,
    draft,
  });
  const expectedNames = expectedDesktopAssetNames(version, environment);
  const allowedNames = new Set([...expectedNames, ...extraAssetNames]);
  invariant(
    release.assets.length === allowedNames.size,
    extraAssetNames.size
      ? 'Release asset count does not match current plus retained assets.'
      : 'Release must contain exactly five desktop assets.'
  );

  const assets = new Map();
  for (const rawAsset of release.assets) {
    const asset = normalizeReleaseAsset(rawAsset);
    invariant(
      !assets.has(asset.name),
      `Duplicate release asset: ${asset.name}`
    );
    invariant(
      allowedNames.has(asset.name),
      `Unexpected release asset: ${asset.name}`
    );
    assets.set(asset.name, asset);
  }

  for (const name of expectedNames) {
    const asset = assets.get(name);
    const buffer = buffers.get(name);
    invariant(asset, `Release asset is missing: ${name}`);
    invariant(
      Buffer.isBuffer(buffer),
      `Artifact bytes are missing for ${name}.`
    );
    invariant(
      asset.size === buffer.length,
      `Asset size does not match ${name}.`
    );
    invariant(
      asset.digest === `sha256:${sha(buffer, 'sha256', 'hex')}`,
      `Server SHA-256 does not match ${name}.`
    );
  }
  for (const name of extraAssetNames) {
    invariant(assets.has(name), `Retained staging asset is missing: ${name}`);
  }

  const metadata = parseLatestMacYaml(
    buffers.get(spec.channelFile).toString('utf8')
  );
  validateUpdaterMetadata({ buffers, environment, metadata, version });
}

function retainedPublishedStagingAssetNames(oldFeedBuffer, release, version) {
  const retainedVersion = oldFeedBuffer
    ? parseLatestMacYaml(oldFeedBuffer.toString('utf8')).version
    : null;
  const expected = new Set(expectedDesktopAssetNames(version, 'staging'));
  if (!retainedVersion) {
    return new Set(
      release.assets
        .map(asset => asset?.name)
        .filter(
          name =>
            name !== 'staging-mac.yml' &&
            !expected.has(name) &&
            isStagingAssetName(name)
        )
    );
  }
  if (retainedVersion === version) {
    const previousVersion = release.assets.reduce((latest, asset) => {
      const match = STAGING_ASSET_PATTERN.exec(asset?.name || '');
      if (!match || match[1] === version) return latest;
      return !latest ||
        compareTuples(
          stagingVersionTuple(match[1]),
          stagingVersionTuple(latest)
        ) > 0n
        ? match[1]
        : latest;
    }, null);
    return new Set(
      previousVersion
        ? expectedDesktopAssetNames(previousVersion, 'staging').filter(
            name => name !== 'staging-mac.yml'
          )
        : []
    );
  }
  return new Set(
    expectedDesktopAssetNames(retainedVersion, 'staging').filter(
      name => name !== 'staging-mac.yml'
    )
  );
}

class GitHubClient {
  constructor({ repository, token }) {
    invariant(
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository),
      'GitHub repository is malformed.'
    );
    invariant(token, 'GH_TOKEN is required.');
    this.repository = repository;
    this.token = token;
    this.apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
  }

  async request(path, options = {}) {
    const url = path.startsWith('https://') ? path : `${this.apiUrl}${path}`;
    const { allowNotFound, raw, timeout, ...fetchOptions } = options;
    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'User-Agent': 'jovie-desktop-release-proof',
        'X-GitHub-Api-Version': API_VERSION,
        ...options.headers,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout ?? 120_000),
    });
    if (allowNotFound && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GitHub API ${options.method || 'GET'} ${url} failed (${response.status}): ${body.slice(0, 500)}`
      );
    }
    if (raw) {
      return Buffer.from(await response.arrayBuffer());
    }
    return response.status === 204
      ? null
      : /** @type {any} */ (await response.json());
  }

  async releaseByTag(tag, allowNotFound = false) {
    return this.request(
      `/repos/${this.repository}/releases/tags/${encodeURIComponent(tag)}`,
      { allowNotFound }
    );
  }

  async releaseOrDraftByTag(tag, allowNotFound = false) {
    const published = await this.releaseByTag(tag, true);
    if (published) {
      return published;
    }
    const releases = await this.request(
      `/repos/${this.repository}/releases?per_page=100`
    );
    invariant(Array.isArray(releases), 'GitHub releases are malformed.');
    const matches = releases.filter(release => release?.tag_name === tag);
    invariant(matches.length <= 1, `Duplicate release tag: ${tag}`);
    if (matches.length === 0 && !allowNotFound) {
      throw new Error(`Release not found: ${tag}`);
    }
    return matches[0] || null;
  }

  async releaseById(releaseId) {
    return this.request(`/repos/${this.repository}/releases/${releaseId}`);
  }

  async createDraft({ environment, releaseSha, version }) {
    const spec = releaseSpec(environment, version);
    return this.request(`/repos/${this.repository}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: spec.tag,
        target_commitish: releaseSha,
        name: version,
        draft: true,
        prerelease: spec.prerelease,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async currentMainSha() {
    const commit = await this.request(`/repos/${this.repository}/commits/main`);
    invariant(SHA_PATTERN.test(commit?.sha), 'Current main SHA is malformed.');
    return commit.sha;
  }

  async uploadAsset(release, name, buffer) {
    const uploadUrl = release.upload_url?.replace(/\{\?.*$/, '');
    invariant(
      typeof uploadUrl === 'string' && uploadUrl.startsWith('https://'),
      'Release upload URL is malformed.'
    );
    return this.request(`${uploadUrl}?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: buffer,
      timeout: 300_000,
      headers: {
        'Content-Length': String(buffer.length),
        'Content-Type': 'application/octet-stream',
      },
    });
  }

  async downloadAsset(asset) {
    return this.request(asset.url, {
      headers: { Accept: 'application/octet-stream' },
      raw: true,
      timeout: 300_000,
    });
  }

  async deleteAsset(assetId) {
    invariant(Number.isInteger(assetId) && assetId > 0, 'Asset ID is invalid.');
    return this.request(
      `/repos/${this.repository}/releases/assets/${assetId}`,
      { method: 'DELETE' }
    );
  }

  async publishRelease(releaseId, environment, version) {
    const spec = releaseSpec(environment, version);
    return this.request(`/repos/${this.repository}/releases/${releaseId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        draft: false,
        prerelease: spec.prerelease,
        make_latest: spec.makeLatest,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async updateReleaseMetadata({ environment, releaseId, releaseSha, version }) {
    const spec = releaseSpec(environment, version);
    return this.request(`/repos/${this.repository}/releases/${releaseId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: version,
        prerelease: spec.prerelease,
        target_commitish: releaseSha,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async retargetEmptyDraft(releaseId, releaseSha) {
    return this.request(`/repos/${this.repository}/releases/${releaseId}`, {
      method: 'PATCH',
      body: JSON.stringify({ target_commitish: releaseSha }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async updateTagCommit(tag, releaseSha) {
    return this.request(
      `/repos/${this.repository}/git/refs/tags/${encodeURIComponent(tag)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ force: true, sha: releaseSha }),
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  async resolveTagCommit(tag) {
    let target = await this.request(
      `/repos/${this.repository}/git/ref/tags/${encodeURIComponent(tag)}`
    );
    target = target.object;
    for (let depth = 0; depth < 5 && target?.type === 'tag'; depth += 1) {
      const tagObject = await this.request(
        `/repos/${this.repository}/git/tags/${target.sha}`
      );
      target = tagObject.object;
    }
    invariant(
      target?.type === 'commit',
      'Release tag does not resolve to a commit.'
    );
    invariant(SHA_PATTERN.test(target.sha), 'Release tag commit is malformed.');
    return target.sha;
  }
}

async function writeOutputs(path, values) {
  invariant(path, 'GitHub output path is required.');
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  await appendFile(path, `${lines}\n`);
}

async function readLocalBuffers(dist, environment, version) {
  const buffers = new Map();
  for (const name of expectedDesktopAssetNames(version, environment)) {
    const path = join(dist, name);
    const contents = await readFile(path);
    invariant(contents.length > 0, `Local desktop artifact is empty: ${path}`);
    buffers.set(name, contents);
  }
  return buffers;
}

async function downloadReleaseBuffers(client, release, environment, version) {
  const expected = new Set(expectedDesktopAssetNames(version, environment));
  const buffers = new Map();
  for (const rawAsset of release.assets) {
    const asset = normalizeReleaseAsset(rawAsset);
    if (
      environment === 'staging' &&
      asset.name !== 'staging-mac.yml' &&
      isStagingAssetName(asset.name) &&
      !expected.has(asset.name)
    ) {
      continue;
    }
    invariant(
      expected.has(asset.name),
      `Unexpected release asset: ${asset.name}`
    );
    invariant(
      !buffers.has(asset.name),
      `Duplicate release asset: ${asset.name}`
    );
    buffers.set(asset.name, await client.downloadAsset(asset));
  }
  return buffers;
}

function validateRollingStagingRelease(release) {
  invariant(
    Number.isInteger(release?.id) && release.id > 0,
    'GitHub release ID is malformed.'
  );
  invariant(
    release.tag_name === 'desktop-staging',
    'Staging release tag is not exact.'
  );
  invariant(
    release.prerelease === true,
    'Staging release is not a prerelease.'
  );
  invariant(Array.isArray(release.assets), 'Release assets are malformed.');
  for (const asset of release.assets) {
    invariant(
      isStagingAssetName(normalizeReleaseAsset(asset).name),
      `Unexpected staging release asset: ${asset.name}`
    );
  }
  if (!release.draft) {
    invariant(
      typeof release.published_at === 'string' &&
        release.published_at.length > 0,
      'Published staging release has no publication timestamp.'
    );
  }
}

async function readCurrentStagingVersion(client, release) {
  const feedAssets = release.assets.filter(
    asset => asset?.name === 'staging-mac.yml'
  );
  invariant(
    feedAssets.length <= 1,
    'Staging release has duplicate feed assets.'
  );
  const versions = [];
  if (feedAssets.length) {
    const feedAsset = normalizeReleaseAsset(feedAssets[0]);
    const metadata = parseLatestMacYaml(
      (await client.downloadAsset(feedAsset)).toString('utf8')
    );
    stagingVersionTuple(metadata.version);
    versions.push(metadata.version);
  }
  if (STAGING_SEMVER_PATTERN.test(release.name || '')) {
    versions.push(release.name);
  }
  for (const asset of release.assets) {
    const match = STAGING_ASSET_PATTERN.exec(asset.name || '');
    if (match) versions.push(match[1]);
  }
  return versions.reduce(
    (latest, candidate) =>
      !latest ||
      compareTuples(
        stagingVersionTuple(candidate),
        stagingVersionTuple(latest)
      ) > 0n
        ? candidate
        : latest,
    null
  );
}

function assertStagingCandidate({
  currentFeedVersion,
  installedVersion,
  version,
}) {
  assertStagingVersionTransition({ installedVersion, version });
  if (currentFeedVersion === version) {
    return;
  }
  assertStagingVersionTransition({
    currentFeedVersion,
    installedVersion,
    version,
  });
}

function updateRelease(client, release, environment, releaseSha, version) {
  return client.updateReleaseMetadata({
    environment,
    releaseId: release.id,
    releaseSha,
    version,
  });
}

export async function prepare({
  client,
  environment,
  installedVersion,
  releaseSha,
  version,
}) {
  const spec = releaseSpec(environment, version);
  let release = await client.releaseOrDraftByTag(spec.tag, true);
  if (environment === 'staging') {
    assertStagingVersionTransition({ installedVersion, version });
    if (release) {
      release = await removeStagingStarterAssets(client, release);
      validateRollingStagingRelease(release);
      assertStagingCandidate({
        currentFeedVersion: await readCurrentStagingVersion(client, release),
        installedVersion,
        version,
      });
      if (!release.draft) return;
      if (release.target_commitish !== releaseSha || release.name !== version) {
        const staleAssets = release.assets.map(normalizeReleaseAsset);
        for (const asset of staleAssets) await client.deleteAsset(asset.id);
        await updateRelease(client, release, environment, releaseSha, version);
        release = await client.releaseById(release.id);
        invariant(
          release.assets.length === 0,
          'Retargeted staging draft is not empty.'
        );
      }
    }
  }

  if (!release) {
    release = await client.createDraft({ environment, releaseSha, version });
  } else if (release.target_commitish !== releaseSha) {
    invariant(
      release.draft === true &&
        Array.isArray(release.assets) &&
        release.assets.length === 0,
      'A non-empty or public release cannot be retargeted.'
    );
    release = await client.retargetEmptyDraft(release.id, releaseSha);
  }
  validateReleaseEnvelope({
    environment,
    release,
    releaseSha,
    version,
    draft: true,
  });
  const expected = new Set(expectedDesktopAssetNames(version, environment));
  for (const asset of release.assets) {
    normalizeReleaseAsset(asset);
    invariant(
      expected.has(asset.name),
      `Draft contains unexpected asset: ${asset.name}`
    );
  }
}

async function uploadOrVerifyAsset(client, release, name, buffer) {
  const matches = release.assets.filter(asset => asset?.name === name);
  invariant(matches.length <= 1, `Duplicate asset: ${name}`);
  if (matches.length === 0) {
    await client.uploadAsset(release, name, buffer);
    return;
  }
  const asset = normalizeReleaseAsset(matches[0]);
  invariant(
    (await client.downloadAsset(asset)).equals(buffer),
    `Existing release asset does not byte-match local output: ${name}`
  );
}

async function rollPublishedStaging({
  client,
  localBuffers,
  output,
  release,
  releaseSha,
  version,
}) {
  const channelFile = 'staging-mac.yml';
  const previous = {
    tagSha: await client.resolveTagCommit('desktop-staging'),
    targetCommitish: release.target_commitish,
    version: release.name,
  };
  invariant(
    SHA_PATTERN.test(previous.tagSha) &&
      typeof previous.targetCommitish === 'string' &&
      previous.targetCommitish.length > 0 &&
      STAGING_SEMVER_PATTERN.test(previous.version),
    'Staging release identity has malformed provenance.'
  );
  for (const [name, buffer] of localBuffers) {
    if (name !== channelFile) {
      await uploadOrVerifyAsset(client, release, name, buffer);
    }
  }
  invariant(
    (await client.currentMainSha()) === releaseSha,
    'Desktop generation was superseded before release publication.'
  );
  await client.updateTagCommit('desktop-staging', releaseSha);
  try {
    release = await client.updateReleaseMetadata({
      environment: 'staging',
      releaseId: release.id,
      releaseSha,
      version,
    });
  } catch (metadataError) {
    try {
      await client.updateTagCommit('desktop-staging', previous.tagSha);
    } catch (rollbackError) {
      throw new AggregateError(
        [metadataError, rollbackError],
        'Staging metadata update and tag rollback both failed; rerun is required.'
      );
    }
    throw metadataError;
  }

  const oldFeed = release.assets.find(asset => asset.name === channelFile);
  const localFeed = localBuffers.get(channelFile);
  const oldFeedBuffer = oldFeed
    ? await client.downloadAsset(normalizeReleaseAsset(oldFeed))
    : null;
  const retainedAssetNames = retainedPublishedStagingAssetNames(
    oldFeedBuffer,
    release,
    version
  );
  const feedMatches = oldFeedBuffer?.equals(localFeed);
  if (!feedMatches) {
    if (oldFeed) await client.deleteAsset(normalizeReleaseAsset(oldFeed).id);
    try {
      await client.uploadAsset(release, channelFile, localFeed);
    } catch (uploadError) {
      if (oldFeedBuffer) {
        try {
          release = await removeStagingStarterAssets(
            client,
            await client.releaseById(release.id)
          );
          await client.uploadAsset(release, channelFile, oldFeedBuffer);
        } catch (restoreError) {
          throw new AggregateError(
            [uploadError, restoreError],
            'Staging feed upload and rollback both failed; rerun is required.'
          );
        }
        try {
          release = await client.updateReleaseMetadata({
            environment: 'staging',
            releaseId: release.id,
            releaseSha: previous.targetCommitish,
            version: previous.version,
          });
        } catch (error) {
          throw new AggregateError(
            [uploadError, error],
            'Staging feed restored but metadata rollback failed; rerun is required.'
          );
        }
        try {
          await client.updateTagCommit('desktop-staging', previous.tagSha);
        } catch (error) {
          throw new AggregateError(
            [uploadError, error],
            'Staging feed restored but tag rollback failed; rerun is required.'
          );
        }
      }
      throw uploadError;
    }
  }

  const expected = new Set(expectedDesktopAssetNames(version, 'staging'));
  release = await client.releaseById(release.id);
  for (const asset of release.assets) {
    if (!expected.has(asset.name) && !retainedAssetNames.has(asset.name)) {
      await client.deleteAsset(normalizeReleaseAsset(asset).id);
    }
  }
  release = await client.releaseById(release.id);
  validateReleaseAssets({
    buffers: localBuffers,
    environment: 'staging',
    extraAssetNames: retainedAssetNames,
    release,
    releaseSha,
    version,
    draft: false,
  });
  invariant(
    (await client.resolveTagCommit('desktop-staging')) === releaseSha,
    'Published staging release tag does not target the authorized commit.'
  );
  invariant(
    (await client.currentMainSha()) === releaseSha,
    'Desktop generation was superseded before release receipt.'
  );
  await writeOutputs(output, {
    asset_count: release.assets.length,
    release_id: release.id,
    release_sha: releaseSha,
    release_tag: 'desktop-staging',
    release_version: version,
  });
}

export async function uploadAndPublish({
  client,
  dist,
  environment,
  installedVersion,
  output,
  releaseSha,
  version,
}) {
  const tag = releaseSpec(environment, version).tag;
  let release = await client.releaseOrDraftByTag(tag);
  const localBuffers = await readLocalBuffers(dist, environment, version);
  if (environment === 'staging') {
    release = await removeStagingStarterAssets(client, release);
    validateRollingStagingRelease(release);
    assertStagingCandidate({
      currentFeedVersion: await readCurrentStagingVersion(client, release),
      installedVersion,
      version,
    });
    if (!release.draft) {
      return rollPublishedStaging({
        client,
        localBuffers,
        output,
        release,
        releaseSha,
        version,
      });
    }
  }
  validateReleaseEnvelope({
    environment,
    release,
    releaseSha,
    version,
    draft: true,
  });
  const existingAssets = new Map();

  for (const rawAsset of release.assets) {
    const asset = normalizeReleaseAsset(rawAsset);
    invariant(
      localBuffers.has(asset.name),
      `Draft contains unexpected asset: ${asset.name}`
    );
    invariant(
      !existingAssets.has(asset.name),
      `Duplicate asset: ${asset.name}`
    );
    const remoteBuffer = await client.downloadAsset(asset);
    invariant(
      remoteBuffer.equals(localBuffers.get(asset.name)),
      `Existing draft asset does not byte-match local output: ${asset.name}`
    );
    existingAssets.set(asset.name, asset);
  }

  for (const [name, buffer] of localBuffers) {
    if (!existingAssets.has(name)) {
      await client.uploadAsset(release, name, buffer);
    }
  }

  release = await client.releaseById(release.id);
  validateReleaseAssets({
    buffers: localBuffers,
    environment,
    release,
    releaseSha,
    version,
    draft: true,
  });
  invariant(
    (await client.currentMainSha()) === releaseSha,
    'Desktop generation was superseded before release publication.'
  );

  release = await client.publishRelease(release.id, environment, version);
  validateReleaseAssets({
    buffers: localBuffers,
    environment,
    release,
    releaseSha,
    version,
    draft: false,
  });
  invariant(
    (await client.resolveTagCommit(tag)) === releaseSha,
    'Published release tag does not target the authorized commit.'
  );
  if (environment === 'staging') {
    invariant(
      (await client.currentMainSha()) === releaseSha,
      'Desktop generation was superseded before release receipt.'
    );
  }

  await writeOutputs(output, {
    asset_count: release.assets.length,
    release_id: release.id,
    release_sha: releaseSha,
    release_tag: tag,
    release_version: version,
  });
}

async function verifyPublished({
  client,
  environment,
  output,
  releaseSha,
  version,
}) {
  const tag = releaseSpec(environment, version).tag;
  const release = await client.releaseByTag(tag);
  invariant(
    (await client.resolveTagCommit(tag)) === releaseSha,
    'Published release tag does not target the authorized commit.'
  );
  const buffers = await downloadReleaseBuffers(
    client,
    release,
    environment,
    version
  );
  if (environment === 'staging') {
    validateReleaseAssets({
      buffers,
      environment,
      extraAssetNames: retainedPublishedStagingAssetNames(
        null,
        release,
        version
      ),
      release,
      releaseSha,
      version,
      draft: false,
    });
  } else {
    validateReleaseAssets({
      buffers,
      environment,
      release,
      releaseSha,
      version,
      draft: false,
    });
  }
  await writeOutputs(output, {
    asset_count: release.assets.length,
    release_id: release.id,
    release_sha: releaseSha,
    release_tag: tag,
    release_version: version,
  });
}

async function main() {
  const { args, command } = parseArgs(process.argv.slice(2));
  const repository = args.repository || process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  const releaseSha = args.sha;
  const environment = args.environment || 'production';
  invariant(
    environment === 'production' || environment === 'staging',
    'Desktop release environment is invalid.'
  );
  const version =
    args.version ||
    (environment === 'production'
      ? (await readFile('VERSION', 'utf8')).trim()
      : '');
  const installedVersion =
    args['installed-version'] || (await readFile('VERSION', 'utf8')).trim();
  invariant(SHA_PATTERN.test(releaseSha), 'Release SHA is malformed.');
  invariant(
    SEMVER_PATTERN.test(installedVersion),
    'Installed desktop floor is not valid stable semver.'
  );
  releaseSpec(environment, version);
  const client = new GitHubClient({ repository, token });
  const common = {
    client,
    environment,
    installedVersion,
    output: args.output || process.env.GITHUB_OUTPUT,
    releaseSha,
    version,
  };

  if (command === 'prepare') {
    await prepare(common);
  } else if (command === 'upload-and-publish') {
    invariant(args.dist, '--dist is required.');
    await uploadAndPublish({ ...common, dist: args.dist });
  } else if (command === 'verify-published') {
    await verifyPublished(common);
  } else {
    throw new Error(`Unsupported desktop release command: ${command}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[desktop-release-assets] ${message}\n`);
    process.exitCode = 1;
  });
}
