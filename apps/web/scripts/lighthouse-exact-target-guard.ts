#!/usr/bin/env tsx

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  type BigIntStats,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isExactVercelDeploymentUrl,
  parseProbeUrl,
} from './vercel-protected-origin.cjs';

interface ExactLighthouseConfig {
  readonly requestedUrls: readonly string[];
  readonly numberOfRuns: number;
}

interface ArtifactPayload {
  readonly name: string;
  readonly contents: Buffer | string;
}

export interface LighthouseArtifactRecord {
  readonly name: string;
  readonly path: string;
  readonly contents: Buffer;
  readonly sha256: string;
  readonly size: number;
}

export interface LighthouseArtifactSeal {
  readonly version: 1;
  readonly files: readonly {
    readonly name: string;
    readonly sha256: string;
    readonly size: number;
  }[];
}

const LIGHTHOUSE_UPLOAD_ENVIRONMENT_ALLOWLIST = [
  'HOME',
  'PATH',
  'TEMP',
  'TMP',
  'TMPDIR',
] as const;

export function createLighthouseUploadEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const key of LIGHTHOUSE_UPLOAD_ENVIRONMENT_ALLOWLIST) {
    const value = source[key];
    if (value) environment[key] = value;
  }
  if (!environment.PATH) {
    throw new Error('Lighthouse upload requires an explicit executable PATH.');
  }
  return environment;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactRouteIdentity(rawUrl: string, label: string): string {
  const url = parseProbeUrl(rawUrl, label);
  if (!isExactVercelDeploymentUrl(url)) {
    throw new Error(`${label} must be a trusted Jovie deployment URL.`);
  }
  if (url.search) {
    throw new Error(`${label} must not contain a query string.`);
  }
  return `${url.origin}${url.pathname}`;
}

export function validateExactLighthouseConfig(
  rawConfig: unknown
): ExactLighthouseConfig {
  const root = requireRecord(rawConfig, 'Lighthouse config');
  const ci = requireRecord(root.ci, 'Lighthouse config ci');
  const collect = requireRecord(ci.collect, 'Lighthouse collect config');
  const assertionConfig = requireRecord(
    ci.assert,
    'Lighthouse assertion config'
  );

  if (collect.puppeteerScript !== 'scripts/lighthouse-vercel-bypass.cjs') {
    throw new Error(
      'Production Lighthouse collection must use the origin-bound Vercel bootstrap.'
    );
  }
  const settings = requireRecord(
    collect.settings,
    'Lighthouse collect settings'
  );
  if (settings.disableStorageReset !== true) {
    throw new Error(
      'Production Lighthouse collection must preserve the verified exact-host cookie.'
    );
  }

  if (!Array.isArray(collect.url) || collect.url.length === 0) {
    throw new Error('Lighthouse collect config must request at least one URL.');
  }
  const requestedUrls = collect.url.map((value, index) => {
    if (typeof value !== 'string') {
      throw new Error(
        `Lighthouse requested URL ${index + 1} must be a string.`
      );
    }
    exactRouteIdentity(value, `Lighthouse requested URL ${index + 1}`);
    return value;
  });
  if (
    new Set(requestedUrls.map(url => exactRouteIdentity(url, 'URL'))).size !==
    requestedUrls.length
  ) {
    throw new Error('Lighthouse requested routes must be unique.');
  }

  const numberOfRuns = collect.numberOfRuns;
  if (!Number.isInteger(numberOfRuns) || Number(numberOfRuns) < 1) {
    throw new Error('Lighthouse numberOfRuns must be a positive integer.');
  }

  if (assertionConfig.includePassedAssertions !== true) {
    throw new Error(
      'Lighthouse assertions must retain passing results so zero-match matrices fail closed.'
    );
  }
  if (
    !Array.isArray(assertionConfig.assertMatrix) ||
    assertionConfig.assertMatrix.length === 0
  ) {
    throw new Error('Lighthouse assertMatrix must be non-empty.');
  }

  const routeMatchCounts = new Map(requestedUrls.map(url => [url, 0]));
  for (const [index, value] of assertionConfig.assertMatrix.entries()) {
    const matrix = requireRecord(
      value,
      `Lighthouse assertion matrix ${index + 1}`
    );
    if (typeof matrix.matchingUrlPattern !== 'string') {
      throw new Error(
        `Lighthouse assertion matrix ${index + 1} is missing matchingUrlPattern.`
      );
    }
    const assertions = requireRecord(
      matrix.assertions,
      `Lighthouse assertion matrix ${index + 1} assertions`
    );
    if (Object.keys(assertions).length === 0) {
      throw new Error(
        `Lighthouse assertion matrix ${index + 1} has no assertions.`
      );
    }

    let pattern: RegExp;
    try {
      pattern = new RegExp(matrix.matchingUrlPattern);
    } catch {
      throw new Error(
        `Lighthouse assertion matrix ${index + 1} has an invalid URL pattern.`
      );
    }
    const matches = requestedUrls.filter(url => pattern.test(url));
    if (matches.length !== 1) {
      throw new Error(
        `Lighthouse assertion matrix ${index + 1} must match exactly one requested route.`
      );
    }
    routeMatchCounts.set(
      matches[0]!,
      (routeMatchCounts.get(matches[0]!) ?? 0) + 1
    );
  }

  for (const [url, matchCount] of routeMatchCounts) {
    if (matchCount !== 1) {
      throw new Error(
        `Lighthouse requested route ${exactRouteIdentity(url, 'URL')} must have exactly one assertion matrix.`
      );
    }
  }

  return { requestedUrls, numberOfRuns: Number(numberOfRuns) };
}

export function validateExactLighthouseReports(
  config: ExactLighthouseConfig,
  reports: readonly unknown[]
): void {
  const expectedIdentities = new Map(
    config.requestedUrls.map(url => [exactRouteIdentity(url, 'URL'), url])
  );
  const observedCounts = new Map(
    config.requestedUrls.map(url => [exactRouteIdentity(url, 'URL'), 0])
  );

  for (const [index, value] of reports.entries()) {
    const report = requireRecord(value, `Lighthouse report ${index + 1}`);
    if (
      typeof report.requestedUrl !== 'string' ||
      typeof report.finalUrl !== 'string'
    ) {
      throw new Error(
        `Lighthouse report ${index + 1} lacks requestedUrl or finalUrl.`
      );
    }
    const requested = exactRouteIdentity(
      report.requestedUrl,
      `Lighthouse report ${index + 1} requestedUrl`
    );
    if (!expectedIdentities.has(requested)) {
      throw new Error(
        `Lighthouse report ${index + 1} was not requested by the exact deployment config.`
      );
    }
    const final = exactRouteIdentity(
      report.finalUrl,
      `Lighthouse report ${index + 1} finalUrl`
    );
    if (final !== requested) {
      throw new Error(
        `Lighthouse report ${index + 1} left its requested deployment origin or path.`
      );
    }
    observedCounts.set(requested, (observedCounts.get(requested) ?? 0) + 1);
  }

  for (const [route, count] of observedCounts) {
    if (count !== config.numberOfRuns) {
      throw new Error(
        `Lighthouse route ${route} produced ${count}/${config.numberOfRuns} required reports.`
      );
    }
  }
}

export function validateExactLighthouseAssertions(
  config: ExactLighthouseConfig,
  results: readonly unknown[]
): void {
  const expected = new Set(
    config.requestedUrls.map(url => exactRouteIdentity(url, 'URL'))
  );
  const covered = new Set<string>();

  for (const [index, value] of results.entries()) {
    const result = requireRecord(value, `Lighthouse assertion ${index + 1}`);
    if (typeof result.url !== 'string') {
      throw new Error(`Lighthouse assertion ${index + 1} lacks a URL.`);
    }
    const route = exactRouteIdentity(
      result.url,
      `Lighthouse assertion ${index + 1} URL`
    );
    if (!expected.has(route)) {
      throw new Error(
        `Lighthouse assertion ${index + 1} targets an unexpected route.`
      );
    }
    covered.add(route);
  }

  for (const route of expected) {
    if (!covered.has(route)) {
      throw new Error(
        `Lighthouse assertion matrix produced zero results for ${route}.`
      );
    }
  }
}

export function validateNoSensitiveArtifactValues(
  artifacts: readonly ArtifactPayload[],
  sensitiveValues: readonly string[]
): void {
  const values = [...new Set(sensitiveValues.filter(Boolean))];
  if (values.length === 0) {
    throw new Error('Lighthouse artifact scan received no sensitive values.');
  }
  for (const artifact of artifacts) {
    const payload = Buffer.isBuffer(artifact.contents)
      ? artifact.contents
      : Buffer.from(artifact.contents);
    if (
      values.some(
        value =>
          artifact.name.includes(value) || payload.includes(Buffer.from(value))
      )
    ) {
      throw new Error('Lighthouse artifacts contain protected probe state.');
    }
  }
}

function isInside(root: string, path: string): boolean {
  const child = relative(root, path);
  return (
    child === '' ||
    (child !== '..' && !child.startsWith(`..${sep}`) && !child.startsWith(sep))
  );
}

function statKey(stat: BigIntStats): string {
  return [
    stat.dev,
    stat.ino,
    stat.mode,
    stat.size,
    stat.mtimeNs,
    stat.ctimeNs,
  ].join(':');
}

export function readRegularArtifactRecords(
  rawDirectory: string
): LighthouseArtifactRecord[] {
  const lexicalDirectory = resolve(rawDirectory);
  const directoryStat = lstatSync(lexicalDirectory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error(
      'Lighthouse artifact directory must be a canonical regular directory.'
    );
  }
  const directory = realpathSync(lexicalDirectory);

  return readdirSync(directory)
    .toSorted()
    .map(name => {
      const path = resolve(directory, name);
      if (!isInside(directory, path) || dirname(path) !== directory) {
        throw new Error('Lighthouse artifact path escaped its directory.');
      }
      const lexicalStat = lstatSync(path);
      if (lexicalStat.isSymbolicLink() || !lexicalStat.isFile()) {
        throw new Error(
          'Lighthouse artifact tree contains a symlink or non-regular entry.'
        );
      }
      const descriptor = openSync(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      try {
        const before = fstatSync(descriptor, { bigint: true });
        if (!before.isFile()) {
          throw new Error('Lighthouse artifact changed type while opening.');
        }
        const contents = readFileSync(descriptor);
        const after = fstatSync(descriptor, { bigint: true });
        if (
          statKey(before) !== statKey(after) ||
          BigInt(contents.length) !== after.size
        ) {
          throw new Error('Lighthouse artifact changed while reading.');
        }
        return {
          name,
          path,
          contents,
          sha256: createHash('sha256').update(contents).digest('hex'),
          size: contents.length,
        };
      } finally {
        closeSync(descriptor);
      }
    });
}

export function createLighthouseArtifactSeal(
  records: readonly LighthouseArtifactRecord[]
): LighthouseArtifactSeal {
  if (records.length === 0) {
    throw new Error('Lighthouse artifact set is empty.');
  }
  return {
    version: 1,
    files: records.map(({ name, sha256, size }) => ({ name, sha256, size })),
  };
}

export function validateLighthouseArtifactSeal(
  seal: LighthouseArtifactSeal,
  records: readonly LighthouseArtifactRecord[]
): void {
  const current = createLighthouseArtifactSeal(records);
  if (JSON.stringify(current) !== JSON.stringify(seal)) {
    throw new Error('Lighthouse artifact set changed after validation.');
  }
}

function parseJson(contents: Buffer | string, label: string): unknown {
  try {
    return JSON.parse(contents.toString()) as unknown;
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

function readCanonicalRegularFile(path: string): Buffer {
  const resolvedPath = resolve(path);
  const stat = lstatSync(resolvedPath, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error('Lighthouse JSON input must be a canonical regular file.');
  }
  const descriptor = openSync(
    resolvedPath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const contents = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      statKey(stat) !== statKey(before) ||
      statKey(before) !== statKey(after) ||
      BigInt(contents.length) !== after.size
    ) {
      throw new Error('Lighthouse JSON input changed while reading.');
    }
    return contents;
  } finally {
    closeSync(descriptor);
  }
}

function readJson(path: string): unknown {
  return parseJson(readCanonicalRegularFile(path), 'Lighthouse JSON input');
}

function readReports(records: readonly LighthouseArtifactRecord[]): unknown[] {
  return records
    .filter(record => /^lhr-\d+\.json$/.test(record.name))
    .map(record => parseJson(record.contents, record.name));
}

export function readSensitiveValues(
  path: string,
  reportsDirectory?: string
): string[] {
  if (!existsSync(path)) {
    throw new Error('Lighthouse sensitive-values receipt is missing.');
  }
  const lexicalPath = resolve(path);
  const stat = lstatSync(lexicalPath, { bigint: true });
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    Number(stat.mode & 0o777n) !== 0o600
  ) {
    throw new Error(
      'Lighthouse sensitive-values receipt must be a mode-0600 regular file.'
    );
  }
  const canonicalPath = realpathSync(lexicalPath);
  if (
    reportsDirectory &&
    isInside(realpathSync(resolve(reportsDirectory)), canonicalPath)
  ) {
    throw new Error(
      'Lighthouse sensitive-values receipt must be outside the upload tree.'
    );
  }
  const descriptor = openSync(
    lexicalPath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  let contents: string;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || statKey(stat) !== statKey(before)) {
      throw new Error(
        'Lighthouse sensitive-values receipt changed before reading.'
      );
    }
    contents = readFileSync(descriptor, 'utf8');
    const after = fstatSync(descriptor, { bigint: true });
    if (statKey(before) !== statKey(after)) {
      throw new Error(
        'Lighthouse sensitive-values receipt changed while reading.'
      );
    }
  } finally {
    closeSync(descriptor);
  }
  const values = contents.split(/\r?\n/).filter(Boolean);
  if (values.length === 0) {
    throw new Error('Lighthouse sensitive-values receipt is empty.');
  }
  return values;
}

function readArtifactJson(
  path: string,
  directory: string,
  records: readonly LighthouseArtifactRecord[]
): unknown {
  const resolvedDirectory = resolve(directory);
  const canonicalDirectory = realpathSync(resolvedDirectory);
  const resolvedPath = realpathSync(resolve(path));
  if (dirname(resolvedPath) !== canonicalDirectory) {
    throw new Error(
      'Lighthouse assertion evidence must be inside the sealed set.'
    );
  }
  const record = records.find(entry => entry.path === resolvedPath);
  if (!record) {
    throw new Error(
      'Lighthouse assertion evidence is missing from the sealed set.'
    );
  }
  return parseJson(record.contents, record.name);
}

export function uploadSealedArtifacts(
  configPath: string,
  reportsDirectory: string,
  seal: LighthouseArtifactSeal,
  sensitiveValues: readonly string[] = [],
  spawnImpl: typeof spawnSync = spawnSync
): void {
  const configContents = readCanonicalRegularFile(configPath);
  const config = validateExactLighthouseConfig(
    parseJson(configContents, 'Lighthouse JSON input')
  );
  const beforeUpload = readRegularArtifactRecords(reportsDirectory);
  validateLighthouseArtifactSeal(seal, beforeUpload);
  if (beforeUpload.some(record => record.name === 'links.json')) {
    throw new Error(
      'Lighthouse upload links must be generated by this sealed upload.'
    );
  }
  const directory = realpathSync(resolve(reportsDirectory));
  if (basename(directory) !== '.lighthouseci') {
    throw new Error(
      'Sealed Lighthouse upload requires the canonical .lighthouseci directory.'
    );
  }
  // `lhci upload` is third-party code. Never clone the Actions environment:
  // it can contain short-lived OIDC, runtime, repository, Vercel, and artifact
  // credentials even when none were intentionally supplied to this step.
  const childEnvironment = createLighthouseUploadEnvironment();
  const uploadRoot = realpathSync(
    mkdtempSync(resolve(dirname(directory), '.jovie-lhci-upload-'))
  );
  const uploadDirectory = resolve(uploadRoot, '.lighthouseci');
  const uploadConfigPath = resolve(uploadRoot, 'lighthouserc.json');

  const writeIsolatedFile = (path: string, contents: Buffer): void => {
    const descriptor = openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o400
    );
    try {
      writeFileSync(descriptor, contents);
      fchmodSync(descriptor, 0o400);
    } finally {
      closeSync(descriptor);
    }
  };

  try {
    mkdirSync(uploadDirectory, { mode: 0o700 });
    writeIsolatedFile(uploadConfigPath, configContents);
    for (const record of beforeUpload) {
      writeIsolatedFile(resolve(uploadDirectory, record.name), record.contents);
    }
    const isolatedConfigStat = statKey(
      lstatSync(uploadConfigPath, { bigint: true })
    );
    const isolatedBefore = readRegularArtifactRecords(uploadDirectory);
    validateLighthouseArtifactSeal(seal, isolatedBefore);
    const isolatedStats = new Map(
      isolatedBefore.map(record => [
        record.name,
        statKey(lstatSync(record.path, { bigint: true })),
      ])
    );

    const upload = spawnImpl(
      'pnpm',
      ['exec', 'lhci', 'upload', `--config=${uploadConfigPath}`],
      {
        cwd: uploadRoot,
        env: childEnvironment,
        stdio: 'inherit',
      }
    );
    // The uploader receives only an isolated copy. Re-prove the source seal as
    // well as every isolated file's unforgeable inode/time identity so a
    // same-UID chmod/write/restore attempt during upload cannot pass unnoticed.
    validateLighthouseArtifactSeal(
      seal,
      readRegularArtifactRecords(reportsDirectory)
    );
    if (upload.status !== 0) {
      throw new Error('Sealed Lighthouse upload failed.');
    }
    if (
      !readCanonicalRegularFile(uploadConfigPath).equals(configContents) ||
      statKey(lstatSync(uploadConfigPath, { bigint: true })) !==
        isolatedConfigStat
    ) {
      throw new Error(
        'Lighthouse isolated upload configuration was mutated during upload.'
      );
    }
    const afterUpload = readRegularArtifactRecords(uploadDirectory);
    const linksRecord = afterUpload.find(
      record => record.name === 'links.json'
    );
    if (!linksRecord) {
      throw new Error('Sealed Lighthouse upload produced no route links.');
    }
    validateLighthouseArtifactSeal(
      seal,
      afterUpload.filter(record => record.name !== 'links.json')
    );
    for (const record of afterUpload) {
      if (record.name === 'links.json') continue;
      if (
        isolatedStats.get(record.name) !==
        statKey(lstatSync(record.path, { bigint: true }))
      ) {
        throw new Error(
          'Lighthouse isolated upload artifact was mutated during upload.'
        );
      }
    }
    const rawLinks = requireRecord(
      parseJson(linksRecord.contents, linksRecord.name),
      'Lighthouse upload links'
    );
    if (
      Object.keys(rawLinks).toSorted().join('\n') !==
      [...config.requestedUrls].toSorted().join('\n')
    ) {
      throw new Error(
        'Sealed Lighthouse upload did not publish every exact route.'
      );
    }
    for (const value of Object.values(rawLinks)) {
      if (typeof value !== 'string') {
        throw new Error('Lighthouse upload emitted a malformed route link.');
      }
      const link = parseProbeUrl(value, 'Lighthouse upload route link');
      if (link.protocol !== 'https:' || link.username || link.password) {
        throw new Error('Lighthouse upload emitted an unsafe route link.');
      }
    }
    if (sensitiveValues.length > 0) {
      validateNoSensitiveArtifactValues(
        afterUpload.map(record => ({
          name: record.name,
          contents: record.contents,
        })),
        sensitiveValues
      );
    }
    validateLighthouseArtifactSeal(
      seal,
      readRegularArtifactRecords(reportsDirectory)
    );
  } finally {
    if (
      dirname(uploadRoot) !== dirname(directory) ||
      !basename(uploadRoot).startsWith('.jovie-lhci-upload-')
    ) {
      throw new Error('Refusing unsafe Lighthouse upload-copy cleanup.');
    }
    rmSync(uploadRoot, { force: true, recursive: true });
  }
}

function readOption(argv: readonly string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = argv.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const configPath = readOption(argv, '--config');
  if (!configPath) {
    throw new Error(
      'Usage: lighthouse-exact-target-guard --config <path> [--reports-dir <path>] [--assertions <path>] [--sensitive-values-file <path>]'
    );
  }

  const config = validateExactLighthouseConfig(readJson(configPath));
  const reportsDirectory = readOption(argv, '--reports-dir');
  const sensitiveValuesPath = readOption(argv, '--sensitive-values-file');
  const upload = argv.includes('--upload');
  try {
    let records: LighthouseArtifactRecord[] | undefined;
    let seal: LighthouseArtifactSeal | undefined;
    let sensitiveValues: string[] | undefined;
    if (reportsDirectory) {
      records = readRegularArtifactRecords(reportsDirectory);
      validateExactLighthouseReports(config, readReports(records));
      const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
      if (!bypassSecret || !sensitiveValuesPath) {
        throw new Error(
          'Lighthouse artifact scan requires protected probe state.'
        );
      }
      sensitiveValues = [
        bypassSecret,
        ...readSensitiveValues(sensitiveValuesPath, reportsDirectory),
      ];
      validateNoSensitiveArtifactValues(
        records.map(record => ({
          name: record.name,
          contents: record.contents,
        })),
        sensitiveValues
      );
      seal = createLighthouseArtifactSeal(records);
    }
    const assertionsPath = readOption(argv, '--assertions');
    if (assertionsPath) {
      const rawResults =
        reportsDirectory && records
          ? readArtifactJson(assertionsPath, reportsDirectory, records)
          : readJson(assertionsPath);
      if (!Array.isArray(rawResults)) {
        throw new Error('Lighthouse assertion results must be an array.');
      }
      validateExactLighthouseAssertions(config, rawResults);
    }
    if (upload) {
      if (!reportsDirectory || !seal || !assertionsPath || !sensitiveValues) {
        throw new Error(
          'Sealed Lighthouse upload requires reports and assertion evidence.'
        );
      }
      if (sensitiveValuesPath && existsSync(sensitiveValuesPath)) {
        unlinkSync(sensitiveValuesPath);
      }
      uploadSealedArtifacts(
        configPath,
        reportsDirectory,
        seal,
        sensitiveValues,
        spawnSync
      );
    }
  } finally {
    if (sensitiveValuesPath && existsSync(sensitiveValuesPath)) {
      unlinkSync(sensitiveValuesPath);
    }
  }

  console.log(
    `[lighthouse:exact-target] Verified ${config.requestedUrls.length} exact route contract(s).`
  );
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch(error => {
    console.error(
      '[lighthouse:exact-target] Failed:',
      error instanceof Error ? error.message : 'Unknown error.'
    );
    process.exitCode = 1;
  });
}
