#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const CONTROL_BUNDLE_SCHEMA = 'symphony-control-bundle/v1';
export const CONTROL_BUNDLE_POLICY = Object.freeze({
  repository: 'JovieInc/Jovie',
  signerWorkflow:
    'JovieInc/Jovie/.github/workflows/symphony-control-release.yml',
  signatureIdentity:
    'JovieInc/Jovie/.github/workflows/symphony-control-release.yml@refs/heads/main',
  predicateType: 'https://slsa.dev/provenance/v1',
  sourceRef: 'refs/heads/main',
  components: Object.freeze([
    'scripts/backlog-orchestrator',
    'scripts/symphony',
  ]),
  compatibility: Object.freeze({
    workflow: 'jovie-ui-pilot/v1',
    runtime: 'openai/symphony',
  }),
});

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const NODE_22_PATTERN = /^v?22\.\d+\.\d+$/;
const PNPM_PATTERN = /^9\.15\.4$/;

async function filesBelow(root) {
  const info = await lstat(root);
  if (info.isSymbolicLink()) {
    throw new Error(`control bundle paths may not contain symlinks: ${root}`);
  }
  if (info.isFile()) return [root];
  if (!info.isDirectory()) {
    throw new Error(`unsupported control bundle path type: ${root}`);
  }
  const result = [];
  const children = await readdir(root, { withFileTypes: true });
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    result.push(...(await filesBelow(join(root, child.name))));
  }
  return result;
}

export async function digestFile(path, root = process.cwd()) {
  return createHash('sha256')
    .update(await readFile(resolve(root, path)))
    .digest('hex');
}

export async function digestPath(path, root = process.cwd()) {
  const absolute = resolve(root, path);
  const info = await lstat(absolute);
  if (info.isFile()) return digestFile(absolute);
  const hash = createHash('sha256');
  for (const file of await filesBelow(absolute)) {
    const name = relative(absolute, file).replaceAll('\\', '/');
    hash.update(name);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function requireNonemptyString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
}

function validateManifestPolicy(manifest, expectedSourceSha) {
  if (manifest?.schema !== CONTROL_BUNDLE_SCHEMA) {
    throw new Error('unsupported control bundle manifest schema');
  }
  if (manifest.repository !== CONTROL_BUNDLE_POLICY.repository) {
    throw new Error(
      'manifest repository does not match the trusted repository'
    );
  }
  if (
    !SOURCE_SHA_PATTERN.test(manifest.sourceSha ?? '') ||
    (expectedSourceSha && manifest.sourceSha !== expectedSourceSha)
  ) {
    throw new Error('manifest sourceSha does not match the expected source');
  }
  requireNonemptyString(manifest.version, 'manifest version');
  if (
    !manifest.artifact ||
    basename(manifest.artifact.path ?? '') !== manifest.artifact.path ||
    !SHA256_PATTERN.test(manifest.artifact.sha256 ?? '')
  ) {
    throw new Error('manifest artifact binding is invalid');
  }

  const components = manifest.components;
  if (!Array.isArray(components)) {
    throw new Error('manifest component bindings are required');
  }
  const actualComponentPaths = components.map(component => component.path);
  if (
    new Set(actualComponentPaths).size !== actualComponentPaths.length ||
    !isDeepStrictEqual(
      [...actualComponentPaths].sort(),
      [...CONTROL_BUNDLE_POLICY.components].sort()
    ) ||
    components.some(component => !SHA256_PATTERN.test(component.sha256 ?? ''))
  ) {
    throw new Error('manifest component bindings do not match policy');
  }

  if (
    manifest.tests?.status !== 'PASS' ||
    typeof manifest.tests.command !== 'string' ||
    manifest.tests.command.trim() === '' ||
    !/^\d+$/.test(String(manifest.tests.runId ?? ''))
  ) {
    throw new Error('manifest test receipt is not a passing hosted receipt');
  }
  if (
    !NODE_22_PATTERN.test(manifest.toolchain?.node ?? '') ||
    !PNPM_PATTERN.test(manifest.toolchain?.pnpm ?? '')
  ) {
    throw new Error('manifest toolchain is missing or incompatible');
  }
  if (
    manifest.signature?.type !== 'github-artifact-attestation' ||
    manifest.signature.identity !== CONTROL_BUNDLE_POLICY.signatureIdentity
  ) {
    throw new Error('manifest signature identity does not match policy');
  }
  if (
    !isDeepStrictEqual(
      manifest.compatibility,
      CONTROL_BUNDLE_POLICY.compatibility
    )
  ) {
    throw new Error('manifest compatibility does not match policy');
  }
}

async function verifyGithubAttestations({
  artifactPath,
  manifestPath,
  attestationBundlePath,
  sourceSha,
  subjects,
}) {
  requireNonemptyString(attestationBundlePath, 'attestation bundle path');
  const bundleInfo = await lstat(resolve(attestationBundlePath));
  if (!bundleInfo.isFile()) {
    throw new Error('attestation bundle path must be a file');
  }
  const policyArgs = [
    '--bundle',
    attestationBundlePath,
    '--repo',
    CONTROL_BUNDLE_POLICY.repository,
    '--signer-workflow',
    CONTROL_BUNDLE_POLICY.signerWorkflow,
    '--source-digest',
    sourceSha,
    '--source-ref',
    CONTROL_BUNDLE_POLICY.sourceRef,
    '--predicate-type',
    CONTROL_BUNDLE_POLICY.predicateType,
    '--format',
    'json',
  ];
  for (const path of [artifactPath, manifestPath]) {
    const { stdout } = await execFileAsync('gh', [
      'attestation',
      'verify',
      path,
      ...policyArgs,
    ]);
    const result = JSON.parse(stdout);
    if (!Array.isArray(result) || result.length === 0) {
      throw new Error(`no verified GitHub attestation found for ${path}`);
    }
  }
  return {
    verified: true,
    repository: CONTROL_BUNDLE_POLICY.repository,
    signerWorkflow: CONTROL_BUNDLE_POLICY.signerWorkflow,
    predicateType: CONTROL_BUNDLE_POLICY.predicateType,
    sourceSha,
    subjects,
  };
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
  if (!SOURCE_SHA_PATTERN.test(sourceSha ?? '')) {
    throw new Error('a full 40- or 64-character sourceSha is required');
  }
  requireNonemptyString(repository, 'repository');
  requireNonemptyString(version, 'version');
  const components = [];
  for (const path of [...new Set(componentPaths ?? [])].sort()) {
    components.push({ path, sha256: await digestPath(path, root) });
  }
  const manifest = {
    schema: CONTROL_BUNDLE_SCHEMA,
    repository,
    sourceSha,
    version,
    artifact: {
      path: artifactName,
      sha256: await digestFile(artifactPath, root),
    },
    components,
    toolchain: toolchain ?? {},
    tests: testReceipt ?? { status: 'UNKNOWN' },
    signature: signature ?? { type: 'UNKNOWN', identity: 'UNKNOWN' },
    compatibility: compatibility ?? { workflow: 'UNKNOWN', runtime: 'UNKNOWN' },
  };
  validateManifestPolicy(manifest, sourceSha);
  return manifest;
}

export async function verifyManifest(
  manifest,
  {
    artifactPath,
    manifestPath,
    attestationBundlePath,
    sourceSha,
    root = process.cwd(),
    attestationVerifier = verifyGithubAttestations,
  } = {}
) {
  validateManifestPolicy(manifest, sourceSha);
  requireNonemptyString(manifestPath, 'manifest path');
  const storedManifest = JSON.parse(
    await readFile(resolve(root, manifestPath))
  );
  if (!isDeepStrictEqual(storedManifest, manifest)) {
    throw new Error('manifest input does not match the attested manifest file');
  }

  const artifact = artifactPath ?? manifest.artifact.path;
  const artifactSha256 = await digestFile(artifact, root);
  if (artifactSha256 !== manifest.artifact.sha256) {
    throw new Error('artifact digest does not match the manifest');
  }
  for (const component of manifest.components) {
    if ((await digestPath(component.path, root)) !== component.sha256) {
      throw new Error(`component digest does not match: ${component.path}`);
    }
  }

  const absoluteArtifact = resolve(root, artifact);
  const absoluteManifest = resolve(root, manifestPath);
  const subjects = [
    { path: absoluteArtifact, sha256: artifactSha256 },
    { path: absoluteManifest, sha256: await digestFile(absoluteManifest) },
  ];
  const evidence = await attestationVerifier({
    artifactPath: absoluteArtifact,
    manifestPath: absoluteManifest,
    attestationBundlePath,
    sourceSha: manifest.sourceSha,
    subjects,
  });
  if (
    evidence?.verified !== true ||
    evidence.repository !== CONTROL_BUNDLE_POLICY.repository ||
    evidence.signerWorkflow !== CONTROL_BUNDLE_POLICY.signerWorkflow ||
    evidence.predicateType !== CONTROL_BUNDLE_POLICY.predicateType ||
    evidence.sourceSha !== manifest.sourceSha ||
    !isDeepStrictEqual(evidence.subjects, subjects)
  ) {
    throw new Error('authenticated attestation evidence does not match policy');
  }
  return true;
}

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    if (!key || argv[index + 1] === undefined) {
      throw new Error(`invalid argument: ${argv[index] ?? ''}`);
    }
    result[key] = argv[index + 1];
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...argv] = process.argv.slice(2);
  const args = options(argv);
  if (command === 'build') {
    const manifest = await buildManifest({
      repository: args.repository,
      sourceSha: args.sourceSha,
      version: args.version,
      artifactPath: args.artifact,
      componentPaths: (args.components ?? '').split(',').filter(Boolean),
      testReceipt: JSON.parse(args.tests ?? '{}'),
      toolchain: JSON.parse(args.toolchain ?? '{}'),
      signature: JSON.parse(args.signature ?? '{}'),
      compatibility: JSON.parse(args.compatibility ?? '{}'),
    });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } else if (command === 'verify') {
    const manifest = JSON.parse(await readFile(args.manifest, 'utf8'));
    await verifyManifest(manifest, {
      artifactPath: args.artifact,
      manifestPath: args.manifest,
      attestationBundlePath: args.attestationBundle,
      sourceSha: args.sourceSha,
    });
    process.stdout.write('CONTROL_BUNDLE_VERIFIED\n');
  } else {
    throw new Error('expected build or verify command');
  }
}
