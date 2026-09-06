#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

export const CONTROL_BUNDLE_SCHEMA = 'symphony-control-bundle/v1';
const SHA_PATTERN = /^[0-9a-f]{40,64}$/;

async function entries(root) {
  const info = await stat(root);
  if (info.isFile()) return [root];
  const { readdir } = await import('node:fs/promises');
  const children = await readdir(root, { withFileTypes: true });
  const result = [];
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    result.push(...(await entries(join(root, child.name))));
  }
  return result;
}

export async function digestPath(path, root = process.cwd()) {
  const absolute = resolve(root, path);
  const hash = createHash('sha256');
  for (const file of await entries(absolute)) {
    const name = relative(root, file).replaceAll('\\', '/');
    hash.update(name);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function buildManifest({
  repository,
  sourceSha,
  version,
  artifactPath,
  artifactName = basename(artifactPath),
  componentPaths,
  testReceipt,
  toolchain,
  signature,
  compatibility,
  root = process.cwd(),
}) {
  if (!repository || !SHA_PATTERN.test(sourceSha ?? '') || !version) {
    throw new Error('repository, full sourceSha, and version are required');
  }
  const components = [];
  for (const path of [...new Set(componentPaths ?? [])].sort()) {
    components.push({ path, sha256: await digestPath(join(root, path), root) });
  }
  return {
    schema: CONTROL_BUNDLE_SCHEMA,
    repository,
    sourceSha,
    version,
    artifact: {
      path: artifactName,
      sha256: await digestPath(artifactPath, root),
    },
    components,
    toolchain: toolchain ?? {},
    tests: testReceipt ?? { status: 'UNKNOWN' },
    signature: signature ?? { type: 'UNKNOWN', identity: 'UNKNOWN' },
    compatibility: compatibility ?? { workflow: 'UNKNOWN', runtime: 'UNKNOWN' },
  };
}

export async function verifyManifest(
  manifest,
  { artifactPath, sourceSha, root = process.cwd() } = {}
) {
  if (manifest?.schema !== CONTROL_BUNDLE_SCHEMA) {
    throw new Error('unsupported control bundle manifest schema');
  }
  if (
    !SHA_PATTERN.test(manifest.sourceSha ?? '') ||
    (sourceSha && manifest.sourceSha !== sourceSha)
  ) {
    throw new Error('manifest sourceSha does not match the expected source');
  }
  if (
    !manifest.signature?.identity ||
    manifest.signature.identity === 'UNKNOWN'
  ) {
    throw new Error('manifest signature identity is missing');
  }
  const artifact = artifactPath ?? manifest.artifact?.path;
  if (
    !artifact ||
    (await digestPath(artifact, root)) !== manifest.artifact.sha256
  ) {
    throw new Error('artifact digest does not match the manifest');
  }
  for (const component of manifest.components ?? []) {
    if (
      (await digestPath(join(root, component.path), root)) !== component.sha256
    ) {
      throw new Error(`component digest does not match: ${component.path}`);
    }
  }
  return true;
}

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    if (key) result[key] = argv[index + 1];
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = options(process.argv.slice(2));
  const manifest = await buildManifest({
    repository: args.repository,
    sourceSha: args.sourceSha,
    version: args.version,
    artifactPath: args.artifact,
    componentPaths: (args.components ?? '').split(',').filter(Boolean),
    testReceipt: JSON.parse(args.tests ?? '{"status":"UNKNOWN"}'),
    toolchain: JSON.parse(args.toolchain ?? '{}'),
    signature: JSON.parse(
      args.signature ?? '{"type":"UNKNOWN","identity":"UNKNOWN"}'
    ),
    compatibility: JSON.parse(
      args.compatibility ?? '{"workflow":"UNKNOWN","runtime":"UNKNOWN"}'
    ),
  });
  await verifyManifest(manifest, {
    artifactPath: args.artifact,
    sourceSha: args.sourceSha,
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}
