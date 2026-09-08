#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import {
  constants,
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  EVALUATION_RECEIPT_SCHEMA,
  loadRegistry,
  REPORT_SCHEMA,
  registryDigest,
  validateRegistry,
  validateReport,
} from './contracts.mjs';
import {
  assertSafeProbeId,
  digestCanonicalJson,
  requireString,
  SAFE_GIT_SHA,
  validateRuntimeReceipt,
} from './receipt-trust.mjs';

export {
  EVALUATION_RECEIPT_SCHEMA,
  loadRegistry,
  REGISTRY_SCHEMA,
  REPORT_SCHEMA,
  registryDigest,
  validateRegistry,
  validateReport,
} from './contracts.mjs';
export {
  RECEIPT_SCHEMA,
  receiptAttestationPayload,
  validateRuntimeReceipt,
} from './receipt-trust.mjs';

const CLI_ARGUMENTS = new Set([
  '--attestation-public-key',
  '--environment',
  '--environment-version',
  '--evidence-dir',
  '--output-dir',
]);
const REQUIRED_CAPABILITY_IDS = new Set(
  Array.from(
    { length: 16 },
    (_, index) => `SUMMER-COMM-${String(index + 1).padStart(3, '0')}`
  )
);
const CANONICAL_REGISTRY_PATH = fileURLToPath(
  new URL('./registry.json', import.meta.url)
);
const CANONICAL_REGISTRY_REPOSITORY_PATH =
  'scripts/summer-commissioning/registry.json';

function sanitizedGitEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
  );
}

function gitOutput(repositoryRoot, args) {
  return execFileSync('/usr/bin/git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: sanitizedGitEnvironment(),
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function cleanSourceVersion(repositoryRoot) {
  const repositoryRealPath = realpathSync(repositoryRoot);
  const gitTopLevel = realpathSync(
    gitOutput(repositoryRoot, ['rev-parse', '--show-toplevel'])
  );
  if (gitTopLevel !== repositoryRealPath) {
    throw new Error('repositoryRoot must be the Git worktree top level');
  }
  const sourceVersion = gitOutput(repositoryRoot, ['rev-parse', 'HEAD']);
  if (
    gitOutput(repositoryRoot, [
      'status',
      '--porcelain',
      '--untracked-files=all',
    ]) !== ''
  ) {
    throw new Error(
      'commissioning requires a clean repository so source assertions bind to sourceVersion'
    );
  }
  return sourceVersion;
}

function validateCanonicalCommissioningRegistry(registry) {
  if (registry.issue !== 'JOV-5853') {
    throw new Error('canonical commissioning registry must target JOV-5853');
  }
  const ids = new Set(registry.capabilities.map(capability => capability.id));
  if (
    ids.size !== REQUIRED_CAPABILITY_IDS.size ||
    [...REQUIRED_CAPABILITY_IDS].some(id => !ids.has(id))
  ) {
    throw new Error('canonical commissioning registry capability set mismatch');
  }
  if (registry.capabilities.some(capability => capability.critical !== true)) {
    throw new Error(
      'every canonical commissioning capability must be critical'
    );
  }
  return registry;
}

function evaluateSourceAssertion(
  repositoryRoot,
  assertion,
  immutableSourceVersion = null
) {
  const started = performance.now();
  if (immutableSourceVersion) {
    let treeEntry;
    try {
      treeEntry = gitOutput(repositoryRoot, [
        'ls-tree',
        immutableSourceVersion,
        '--',
        assertion.path,
      ]);
    } catch {
      treeEntry = '';
    }
    const regularFile = /^100\d{3} blob [a-f0-9]+\t/u.test(treeEntry);
    if (!regularFile) {
      return {
        kind: assertion.kind,
        path: assertion.path,
        expected: 'regular file in immutable source commit',
        actual:
          treeEntry === '' ? 'file missing' : 'path is not a regular file',
        passed: false,
        latencyMs: Number((performance.now() - started).toFixed(3)),
      };
    }
    if (assertion.kind === 'file_exists') {
      return {
        kind: assertion.kind,
        path: assertion.path,
        expected: 'file exists',
        actual: 'file exists',
        passed: true,
        latencyMs: Number((performance.now() - started).toFixed(3)),
      };
    }
    let contents;
    try {
      contents = gitOutput(repositoryRoot, [
        'show',
        `${immutableSourceVersion}:${assertion.path}`,
      ]);
    } catch {
      return {
        kind: assertion.kind,
        path: assertion.path,
        expected: 'readable regular file in immutable source commit',
        actual: 'git blob unreadable',
        passed: false,
        latencyMs: Number((performance.now() - started).toFixed(3)),
      };
    }
    const contains = contents.includes(assertion.value);
    const passed = assertion.kind === 'file_contains' ? contains : !contains;
    return {
      kind: assertion.kind,
      path: assertion.path,
      expected:
        assertion.kind === 'file_contains' ? 'marker present' : 'marker absent',
      actual: contains ? 'marker present' : 'marker absent',
      passed,
      latencyMs: Number((performance.now() - started).toFixed(3)),
    };
  }
  const absolutePath = resolve(repositoryRoot, assertion.path);
  const exists = existsSync(absolutePath);
  let passed = exists;
  let actual = exists ? 'file exists' : 'file missing';
  if (exists) {
    const repositoryRealPath = realpathSync(repositoryRoot);
    const targetRealPath = realpathSync(absolutePath);
    const containment = relative(repositoryRealPath, targetRealPath);
    if (
      containment === '..' ||
      containment.startsWith(`..${sep}`) ||
      isAbsolute(containment)
    ) {
      return {
        kind: assertion.kind,
        path: assertion.path,
        expected: 'path contained in repository',
        actual: 'path escapes repository',
        passed: false,
        latencyMs: Number((performance.now() - started).toFixed(3)),
      };
    }
    if (!statSync(targetRealPath).isFile()) {
      return {
        kind: assertion.kind,
        path: assertion.path,
        expected: 'regular file inside repository',
        actual: 'path is not a regular file',
        passed: false,
        latencyMs: Number((performance.now() - started).toFixed(3)),
      };
    }
  }
  if (exists && assertion.kind !== 'file_exists') {
    let contents;
    try {
      contents = readFileSync(absolutePath, 'utf8');
    } catch (error) {
      return {
        kind: assertion.kind,
        path: assertion.path,
        expected: 'readable regular file inside repository',
        actual: `file unreadable: ${error.code ?? 'unknown'}`,
        passed: false,
        latencyMs: Number((performance.now() - started).toFixed(3)),
      };
    }
    const contains = contents.includes(assertion.value);
    passed = assertion.kind === 'file_contains' ? contains : !contains;
    actual = contains ? 'marker present' : 'marker absent';
  }
  return {
    kind: assertion.kind,
    path: assertion.path,
    expected:
      assertion.kind === 'file_exists'
        ? 'file exists'
        : assertion.kind === 'file_contains'
          ? 'marker present'
          : 'marker absent',
    actual,
    passed,
    latencyMs: Number((performance.now() - started).toFixed(3)),
  };
}

function runtimeReceiptPath(evidenceDirectory, probeId) {
  return evidenceDirectory ? join(evidenceDirectory, `${probeId}.json`) : null;
}

function readRuntimeReceipt(evidenceDirectory, capability, context) {
  const receiptPath = runtimeReceiptPath(
    evidenceDirectory,
    capability.probe.id
  );
  if (!receiptPath || !existsSync(receiptPath)) {
    return {
      receipt: null,
      receiptPath,
      errors: ['current runtime receipt missing'],
    };
  }
  try {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    return {
      receipt,
      receiptPath,
      errors: validateRuntimeReceipt(receipt, capability, context),
    };
  } catch (error) {
    return {
      receipt: null,
      receiptPath,
      errors: [`runtime receipt unreadable: ${error.message}`],
    };
  }
}

function outputCorrelationId(registry, capability, context) {
  const hash = digestCanonicalJson({
    registryVersion: registry.registryVersion,
    probeId: capability.probe.id,
    probeVersion: capability.probe.version,
    environment: context.environment,
    environmentVersion: context.environmentVersion,
  }).slice(0, 24);
  return `summer-commissioning:${hash}`;
}

function evaluateCapability(registry, capability, context) {
  const startedAt = new Date();
  const started = performance.now();
  const sourceAssertions = capability.probe.sourceAssertions.map(assertion =>
    evaluateSourceAssertion(
      context.repositoryRoot,
      assertion,
      context.immutableSourceVersion
    )
  );
  const sourceErrors = sourceAssertions
    .filter(assertion => !assertion.passed)
    .map(
      assertion =>
        `${assertion.kind} failed for ${assertion.path}: ${assertion.actual}`
    );
  const runtime = readRuntimeReceipt(
    context.evidenceDirectory,
    capability,
    context
  );
  const blockers = [...sourceErrors, ...runtime.errors];
  const effectiveStatus =
    blockers.length === 0
      ? 'certified'
      : capability.status === 'certified'
        ? 'stale'
        : capability.status;
  const completedAt = new Date();
  const failureArtifact =
    blockers.length === 0
      ? null
      : {
          capabilityId: capability.id,
          implementationState: capability.implementationState,
          auditedStatus: capability.status,
          blockers,
          ownerRemediation: capability.ownerRemediation,
        };

  return {
    schema: EVALUATION_RECEIPT_SCHEMA,
    probeId: capability.probe.id,
    probeVersion: capability.probe.version,
    capabilityId: capability.id,
    critical: capability.critical,
    fixture: capability.probe.fixture,
    expectedState: capability.probe.expectedState,
    actualState: effectiveStatus,
    correlationId: outputCorrelationId(registry, capability, context),
    environment: context.environment,
    environmentVersion: context.environmentVersion,
    sourceVersion: context.sourceVersion,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    latencyMs: Number((performance.now() - started).toFixed(3)),
    outcome: effectiveStatus === 'certified' ? 'passed' : 'failed',
    sourceAssertions,
    runtimeReceiptPath: runtime.receiptPath,
    runtimeReceiptCorrelationId: runtime.receipt?.correlationId ?? null,
    failureArtifact,
  };
}

export function runCommissioning(registryInput, options) {
  const registry = validateRegistry(registryInput);
  const repositoryRoot = resolve(options.repositoryRoot);
  if (!options.allowTestRegistry) {
    validateCanonicalCommissioningRegistry(registry);
  }
  const sourceVersion = options.allowTestRegistry
    ? requireString(options.sourceVersion, 'options.sourceVersion')
    : cleanSourceVersion(repositoryRoot);
  if (!options.allowTestRegistry) {
    const canonicalRegistry = validateCanonicalCommissioningRegistry(
      validateRegistry(
        JSON.parse(
          gitOutput(repositoryRoot, [
            'show',
            `${sourceVersion}:${CANONICAL_REGISTRY_REPOSITORY_PATH}`,
          ])
        )
      )
    );
    if (registryDigest(registry) !== registryDigest(canonicalRegistry)) {
      throw new Error(
        'commissioning registry does not match the canonical file'
      );
    }
  }
  const currentRegistryDigest = registryDigest(registry);
  const attestationPublicKey = options.attestationPublicKey
    ? createPublicKey(options.attestationPublicKey)
    : null;
  const attestationKeyFingerprint = attestationPublicKey
    ? createHash('sha256')
        .update(attestationPublicKey.export({ type: 'spki', format: 'der' }))
        .digest('hex')
    : null;
  if (
    attestationKeyFingerprint &&
    !registry.trustedAttestationKeyFingerprints.includes(
      attestationKeyFingerprint
    )
  ) {
    throw new Error(
      'attestation public key fingerprint is not trusted by the registry'
    );
  }
  const context = {
    repositoryRoot,
    evidenceDirectory: options.evidenceDirectory
      ? resolve(options.evidenceDirectory)
      : null,
    environment: requireString(options.environment, 'options.environment'),
    environmentVersion: requireString(
      options.environmentVersion,
      'options.environmentVersion'
    ),
    sourceVersion,
    immutableSourceVersion: options.allowTestRegistry ? null : sourceVersion,
    registryDigest: currentRegistryDigest,
    attestationPublicKey,
    nowMs: options.now ? new Date(options.now).getTime() : Date.now(),
  };
  if (!Number.isFinite(context.nowMs)) {
    throw new Error('options.now must be a valid date');
  }
  if (!SAFE_GIT_SHA.test(context.sourceVersion)) {
    throw new Error('options.sourceVersion must be an exact git SHA');
  }
  if (context.environment !== registry.intendedEnvironment) {
    throw new Error(
      `environment ${context.environment} does not match intended ${registry.intendedEnvironment}`
    );
  }

  const receipts = registry.capabilities.map(capability =>
    evaluateCapability(registry, capability, context)
  );
  const blocking = receipts.filter(
    (receipt, index) =>
      registry.capabilities[index].critical && receipt.outcome !== 'passed'
  );
  const certified = receipts.filter(
    receipt => receipt.actualState === 'certified'
  );
  return validateReport({
    schema: REPORT_SCHEMA,
    registrySchema: registry.schema,
    registryVersion: registry.registryVersion,
    registryDigest: currentRegistryDigest,
    attestationKeyFingerprint,
    certificationContract: registry.certificationContract,
    issue: registry.issue,
    environment: context.environment,
    environmentVersion: context.environmentVersion,
    sourceVersion: context.sourceVersion,
    generatedAt: new Date().toISOString(),
    commissioned: blocking.length === 0,
    summary: {
      capabilities: receipts.length,
      certified: certified.length,
      blocking: blocking.length,
    },
    receipts,
  });
}

async function readPrivateJson(path) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    throw new Error(
      `existing report must be a private regular file: ${error.message}`
    );
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.nlink !== 1) {
      throw new Error('existing report must be a private regular file');
    }
    return JSON.parse(await handle.readFile('utf8'));
  } finally {
    await handle.close();
  }
}

async function writePrivateJson(path, value) {
  const temporaryPath = join(
    dirname(path),
    `.${randomBytes(16).toString('hex')}.tmp`
  );
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function pathsOverlap(left, right) {
  const leftToRight = relative(left, right);
  const rightToLeft = relative(right, left);
  return (
    leftToRight === '' ||
    (!leftToRight.startsWith(`..${sep}`) &&
      leftToRight !== '..' &&
      !isAbsolute(leftToRight)) ||
    (!rightToLeft.startsWith(`..${sep}`) &&
      rightToLeft !== '..' &&
      !isAbsolute(rightToLeft))
  );
}

function canonicalizePotentialPath(path) {
  let cursor = resolve(path);
  const missingSegments = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    missingSegments.unshift(basename(cursor));
    cursor = parent;
  }
  return resolve(realpathSync(cursor), ...missingSegments);
}

export async function writeReport(report, outputDirectory) {
  validateReport(report);
  const currentProbeIds = report.receipts.map(receipt =>
    assertSafeProbeId(receipt?.probeId, 'receipt.probeId')
  );
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  await mkdir(join(outputDirectory, 'failures'), {
    recursive: true,
    mode: 0o700,
  });
  const outputRealPath = realpathSync(outputDirectory);
  const outputMetadata = statSync(outputRealPath);
  if (
    (typeof process.getuid === 'function' &&
      outputMetadata.uid !== process.getuid()) ||
    (outputMetadata.mode & 0o077) !== 0
  ) {
    throw new Error(
      'output directory must be private and owned by the current user'
    );
  }
  const failuresDirectory = join(outputDirectory, 'failures');
  const failuresRealPath = realpathSync(failuresDirectory);
  const failuresContainment = relative(outputRealPath, failuresRealPath);
  if (
    failuresContainment === '..' ||
    failuresContainment.startsWith(`..${sep}`) ||
    isAbsolute(failuresContainment)
  ) {
    throw new Error(
      'failure artifact directory must stay inside output directory'
    );
  }
  const reportPath = join(outputDirectory, 'report.json');
  if (existsSync(reportPath)) {
    const priorReport = await readPrivateJson(reportPath);
    if (!Array.isArray(priorReport.receipts)) {
      throw new Error('existing report receipts must be an array');
    }
    for (const receipt of priorReport.receipts) {
      const probeId = assertSafeProbeId(
        receipt?.probeId,
        'existing receipt.probeId'
      );
      await rm(join(outputDirectory, `${probeId}.json`), { force: true });
      await rm(join(outputDirectory, 'failures', `${probeId}.json`), {
        force: true,
      });
    }
  }
  await writePrivateJson(reportPath, report);
  for (const [index, receipt] of report.receipts.entries()) {
    const probeId = currentProbeIds[index];
    await rm(join(outputDirectory, `${probeId}.json`), { force: true });
    await rm(join(failuresDirectory, `${probeId}.json`), { force: true });
    await writePrivateJson(join(outputDirectory, `${probeId}.json`), receipt);
    if (receipt.failureArtifact) {
      await writePrivateJson(
        join(outputDirectory, 'failures', `${probeId}.json`),
        receipt.failureArtifact
      );
    }
  }
}

export function parseArguments(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!CLI_ARGUMENTS.has(argument)) {
      throw new Error(`unknown argument ${argument}`);
    }
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--'))
      throw new Error(`${argument} requires a value`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

export async function runCli(argv, options = {}) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = options.repositoryRoot
    ? resolve(options.repositoryRoot)
    : resolve(scriptDirectory, '../..');
  const args = parseArguments(argv);
  const registryPath = resolve(options.registryPath ?? CANONICAL_REGISTRY_PATH);
  const registry = loadRegistry(registryPath);
  if (!options.allowTestRegistry) {
    validateCanonicalCommissioningRegistry(validateRegistry(registry));
  }
  const attestationPublicKeyPath = args['attestation-public-key'];
  const evidenceDirectory = args['evidence-dir']
    ? canonicalizePotentialPath(args['evidence-dir'])
    : null;
  const outputDirectory = args['output-dir']
    ? canonicalizePotentialPath(args['output-dir'])
    : null;
  if (
    evidenceDirectory &&
    outputDirectory &&
    pathsOverlap(evidenceDirectory, outputDirectory)
  ) {
    throw new Error('evidence and output directories must not overlap');
  }
  const report = runCommissioning(registry, {
    repositoryRoot,
    evidenceDirectory,
    environment: args.environment ?? 'production-like',
    environmentVersion: requireString(
      args['environment-version'],
      '--environment-version'
    ),
    sourceVersion: options.sourceVersion ?? registry.sourceSnapshot.sha,
    attestationPublicKey: attestationPublicKeyPath
      ? readFileSync(resolve(attestationPublicKeyPath), 'utf8')
      : options.attestationPublicKey,
    now: options.now,
    allowTestRegistry: options.allowTestRegistry === true,
  });
  if (outputDirectory) await writeReport(report, outputDirectory);
  (options.stdout ?? process.stdout).write(
    `${JSON.stringify(report, null, 2)}\n`
  );
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const report = await runCli(argv);
  process.exitCode = report.commissioned ? 0 : 2;
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
