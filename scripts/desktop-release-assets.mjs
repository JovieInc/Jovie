#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const API_VERSION = '2022-11-28';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
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

export function expectedDesktopAssetNames(version) {
  invariant(
    SEMVER_PATTERN.test(version),
    'Desktop version is not valid semver.'
  );
  const prefix = `Jovie-${version}-universal`;
  return [
    `${prefix}.dmg`,
    `${prefix}.dmg.blockmap`,
    `${prefix}.zip`,
    `${prefix}.zip.blockmap`,
    'latest-mac.yml',
  ];
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

function normalizeReleaseAsset(asset) {
  invariant(
    Number.isInteger(asset?.id) && asset.id > 0,
    'Release asset ID is malformed.'
  );
  invariant(
    typeof asset.name === 'string' && asset.name.length > 0,
    'Release asset name is malformed.'
  );
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

export function validateReleaseEnvelope({
  release,
  releaseSha,
  version,
  draft,
}) {
  invariant(
    Number.isInteger(release?.id) && release.id > 0,
    'GitHub release ID is malformed.'
  );
  invariant(release.tag_name === `v${version}`, 'Release tag is not exact.');
  invariant(release.name === version, 'Release title is not exact.');
  invariant(
    release.target_commitish === releaseSha,
    'Release target is not the authorized commit.'
  );
  invariant(
    release.draft === draft,
    draft
      ? 'Production release must remain private while assets upload.'
      : 'Production release is not published.'
  );
  invariant(
    release.prerelease === false,
    'Production release is a prerelease.'
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

export function validateUpdaterMetadata({ buffers, metadata, version }) {
  const dmgName = `Jovie-${version}-universal.dmg`;
  const zipName = `Jovie-${version}-universal.zip`;

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
  release,
  releaseSha,
  version,
  draft,
}) {
  validateReleaseEnvelope({ release, releaseSha, version, draft });
  const expectedNames = expectedDesktopAssetNames(version);
  invariant(
    release.assets.length === expectedNames.length,
    'Release must contain exactly five desktop assets.'
  );

  const assets = new Map();
  for (const rawAsset of release.assets) {
    const asset = normalizeReleaseAsset(rawAsset);
    invariant(
      !assets.has(asset.name),
      `Duplicate release asset: ${asset.name}`
    );
    invariant(
      expectedNames.includes(asset.name),
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

  const metadata = parseLatestMacYaml(
    buffers.get('latest-mac.yml').toString('utf8')
  );
  validateUpdaterMetadata({ buffers, metadata, version });
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

  async createDraft({ releaseSha, version }) {
    return this.request(`/repos/${this.repository}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: `v${version}`,
        target_commitish: releaseSha,
        name: version,
        draft: true,
        prerelease: false,
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

  async publishRelease(releaseId) {
    return this.request(`/repos/${this.repository}/releases/${releaseId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        draft: false,
        prerelease: false,
        make_latest: 'true',
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

async function readLocalBuffers(dist, version) {
  const buffers = new Map();
  for (const name of expectedDesktopAssetNames(version)) {
    const path = join(dist, name);
    const contents = await readFile(path);
    invariant(contents.length > 0, `Local desktop artifact is empty: ${path}`);
    buffers.set(name, contents);
  }
  return buffers;
}

async function downloadReleaseBuffers(client, release, version) {
  const expected = new Set(expectedDesktopAssetNames(version));
  const buffers = new Map();
  for (const rawAsset of release.assets) {
    const asset = normalizeReleaseAsset(rawAsset);
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

async function prepare({ client, releaseSha, version }) {
  let release = await client.releaseOrDraftByTag(`v${version}`, true);
  if (!release) {
    release = await client.createDraft({ releaseSha, version });
  } else if (release.target_commitish !== releaseSha) {
    invariant(
      release.draft === true &&
        Array.isArray(release.assets) &&
        release.assets.length === 0,
      'A non-empty or public release cannot be retargeted.'
    );
    release = await client.retargetEmptyDraft(release.id, releaseSha);
  }
  validateReleaseEnvelope({ release, releaseSha, version, draft: true });
  const expected = new Set(expectedDesktopAssetNames(version));
  for (const asset of release.assets) {
    normalizeReleaseAsset(asset);
    invariant(
      expected.has(asset.name),
      `Draft contains unexpected asset: ${asset.name}`
    );
  }
}

async function uploadAndPublish({ client, dist, output, releaseSha, version }) {
  const tag = `v${version}`;
  let release = await client.releaseOrDraftByTag(tag);
  validateReleaseEnvelope({ release, releaseSha, version, draft: true });
  const localBuffers = await readLocalBuffers(dist, version);
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
    release,
    releaseSha,
    version,
    draft: true,
  });
  invariant(
    (await client.currentMainSha()) === releaseSha,
    'Desktop generation was superseded before release publication.'
  );

  release = await client.publishRelease(release.id);
  validateReleaseAssets({
    buffers: localBuffers,
    release,
    releaseSha,
    version,
    draft: false,
  });
  invariant(
    (await client.resolveTagCommit(tag)) === releaseSha,
    'Published release tag does not target the authorized commit.'
  );

  await writeOutputs(output, {
    asset_count: release.assets.length,
    release_id: release.id,
    release_sha: releaseSha,
    release_tag: tag,
    release_version: version,
  });
}

async function verifyPublished({ client, output, releaseSha, version }) {
  const tag = `v${version}`;
  const release = await client.releaseByTag(tag);
  invariant(
    (await client.resolveTagCommit(tag)) === releaseSha,
    'Published release tag does not target the authorized commit.'
  );
  const buffers = await downloadReleaseBuffers(client, release, version);
  validateReleaseAssets({
    buffers,
    release,
    releaseSha,
    version,
    draft: false,
  });
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
  const version = args.version || (await readFile('VERSION', 'utf8')).trim();
  invariant(SHA_PATTERN.test(releaseSha), 'Release SHA is malformed.');
  invariant(
    SEMVER_PATTERN.test(version),
    'Desktop version is not valid semver.'
  );
  const client = new GitHubClient({ repository, token });
  const common = {
    client,
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
