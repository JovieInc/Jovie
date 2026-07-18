#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  globSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { crc32, inflateSync } from 'node:zlib';

const SENSITIVE =
  /(?:^|_)(?:SECRET|PASSWORD|PASSPHRASE|PRIVATE_KEY(?!_ID(?:_|$))|API_KEY(?!_(?:ID|SID)(?:_|$))|ACCESS_KEY(?!_ID(?:_|$))|HASH_KEY(?!_ID(?:_|$))|DATABASE_URL|DSN|AUTHORIZATION|COOKIE|COOKIES|PROTECTION_BYPASS|ENCRYPT_KEY|ENCRYPTION_KEY|SIGNING_KEY(?!_ID(?:_|$))|SIGNER_KEY(?!_ID(?:_|$))|WEBHOOK_URL|DEPLOY_HOOK(?!_ID(?:_|$))|CAPABILITY_URL|(?:CERTIFICATE|PRIVATE_KEY|SIGNING_KEY|SIGNER_KEY)_(?:BASE64|B64)|CSC_LINK|GITLEAKS_LICENSE)(?:_|$)/;
const EXACT_PUBLIC_IDENTIFIERS = new Set([
  'CLOUDINARY_API_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_SENTRY_DSN_DEV',
]);
const CONNECTION = /(?:^|_)CONNECTION(?:$|_(?:STRING|URL)(?:_|$))/;
const E2E_IDENTITY =
  /^(?:E2E_PROD_(?:USER_EMAIL|SIGNUP_EMAIL_BASE)|E2E_CLERK_(?:USER_USERNAME|ADMIN_USERNAME)|E2E_ADMIN_CLERK_USER_USERNAME)$/;
const TOKEN = /(?:^|_)TOKEN(?:_|$)/;
const TOKEN_METRIC =
  /(?:^|_)TOKEN_(?:BUDGET|COUNT|COUNTS|ESTIMATE|LIMIT|TOTAL|USAGE|USED)(?:_|$)/;
const TOKEN_EXPIRY_METADATA = /(?:^|_)TOKEN(?:_[A-Z0-9]+)*_EXPIRES_AT$/;
const STRUCTURED = new Set(['.json', '.jsonl']);
const IMAGES = new Set([
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
]);
const FORBIDDEN = new Set([
  '.avi',
  '.har',
  '.html',
  '.mkv',
  '.mov',
  '.mp4',
  '.webm',
  '.zip',
]);
const REDACTED = new Set([
  '[redacted]',
  '<redacted>',
  'redacted',
  'none',
  'null',
  'unknown',
]);
const DEFAULT_PATHS = ['apps/web/{playwright-report,test-results}'];

const isInside = (root, path) => {
  const child = relative(root, path);
  return (
    child === '' ||
    (!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep))
  );
};

function canonicalRoot(path = process.env.GITHUB_WORKSPACE ?? process.cwd()) {
  const root = resolve(path);
  if (realpathSync(root) !== root) throw new Error('non-canonical root');
  return root;
}

function checkedStat(path, root) {
  const lexical = resolve(path);
  if (!isInside(root, lexical)) throw new Error('path outside root');
  const stat = lstatSync(lexical);
  if (stat.isSymbolicLink() || realpathSync(lexical) !== lexical)
    throw new Error('symlinked path');
  if (!stat.isFile() && !stat.isDirectory())
    throw new Error('non-regular path');
  return stat;
}

function walk(path, root) {
  const stat = checkedStat(path, root);
  if (stat.isFile()) return [path];
  return readdirSync(path).flatMap(name => walk(resolve(path, name), root));
}

export function resolveArtifactFiles(paths, rootPath, allowEmptyPaths = false) {
  const root = canonicalRoot(rootPath);
  const selected = new Set();
  for (const entry of paths) {
    const exclude = entry.startsWith('!');
    const pattern = exclude ? entry.slice(1) : entry;
    const lexical = resolve(root, pattern);
    if (!isInside(root, lexical)) throw new Error('pattern outside root');
    let matches;
    try {
      lstatSync(lexical);
      matches = [lexical];
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      matches = globSync(pattern, { cwd: root, dot: true }).map(match =>
        resolve(root, match)
      );
    }
    const files = matches.flatMap(path => walk(path, root));
    if (!exclude && files.length === 0 && !allowEmptyPaths)
      throw new Error('artifact path matched no files');
    for (const file of files) {
      if (exclude) selected.delete(file);
      else selected.add(file);
    }
  }
  if (selected.size === 0 && !allowEmptyPaths)
    throw new Error('artifact selection is empty');
  return [...selected].sort();
}

const statKey = stat =>
  ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']
    .map(name => stat[name])
    .join(':');

function readRecords(paths, rootPath, allowEmptyPaths = false) {
  const root = canonicalRoot(rootPath);
  return resolveArtifactFiles(paths, root, allowEmptyPaths).map(path => {
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = fstatSync(fd, { bigint: true });
      if (!before.isFile()) throw new Error('artifact changed type');
      const bytes = readFileSync(fd);
      const after = fstatSync(fd, { bigint: true });
      if (
        statKey(before) !== statKey(after) ||
        BigInt(bytes.length) !== after.size
      )
        throw new Error('artifact changed while reading');
      return {
        bytes,
        path,
        relativePath: relative(root, path),
      };
    } finally {
      closeSync(fd);
    }
  });
}

export function isCredentialBearingName(name) {
  const canonical = name.replace(/[^a-z0-9]+/gi, '_').toUpperCase();
  const normalized = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .toUpperCase();
  return (
    !EXACT_PUBLIC_IDENTIFIERS.has(canonical) &&
    (SENSITIVE.test(normalized) ||
      CONNECTION.test(normalized) ||
      E2E_IDENTITY.test(canonical) ||
      (TOKEN.test(normalized) &&
        !TOKEN_METRIC.test(normalized) &&
        !TOKEN_EXPIRY_METADATA.test(normalized)))
  );
}

function hasValue(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return (
      normalized.length >= 4 &&
      !REDACTED.has(normalized) &&
      !/^\*+$/.test(normalized)
    );
  }
  if (Array.isArray(value)) return value.some(hasValue);
  if (value && typeof value === 'object')
    return hasValue('value' in value ? value.value : Object.values(value));
  return false;
}

function namedValue(name, value) {
  if (
    typeof value === 'string' &&
    /^(?:Proxy[-_.])?Authorization$/i.test(name)
  ) {
    const match = value.match(/^(?:Bearer|Basic|Token)(?:\s+(.+))?$/i);
    if (match) return hasValue(match[1]);
  }
  return hasValue(value);
}

function attachmentUnsafe(value, environment) {
  if (
    typeof value.name !== 'string' ||
    typeof value.contentType !== 'string' ||
    !Object.hasOwn(value, 'body')
  )
    return false;
  const type = value.contentType.split(';')[0].trim().toLowerCase();
  if (
    typeof value.body !== 'string' ||
    !(
      type.startsWith('text/') ||
      /^application\/(?:json|[^/]+\+json)$/.test(type)
    ) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value.body
    )
  )
    return true;
  const bytes = Buffer.from(value.body, 'base64');
  if (bytes.toString('base64') !== value.body) return true;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (type.includes('json')) JSON.parse(text);
    return artifactContainsSecret(text, environment);
  } catch {
    return true;
  }
}

function structuredContains(value, environment) {
  if (typeof value === 'string')
    return secretValues(environment).some(secret => value.includes(secret));
  if (Array.isArray(value)) {
    if (
      value.length === 2 &&
      typeof value[0] === 'string' &&
      isCredentialBearingName(value[0]) &&
      namedValue(value[0], value[1])
    )
      return true;
    return value.some(item => structuredContains(item, environment));
  }
  if (!value || typeof value !== 'object') return false;
  if (attachmentUnsafe(value, environment)) return true;
  if (
    typeof value.name === 'string' &&
    isCredentialBearingName(value.name) &&
    namedValue(value.name, value.value)
  )
    return true;
  return Object.entries(value).some(
    ([name, nested]) =>
      (isCredentialBearingName(name) && hasValue(nested)) ||
      structuredContains(nested, environment)
  );
}

const eligibleCredentialValue = value => {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    !REDACTED.has(normalized) &&
    !/^\*+$/.test(normalized)
  );
};
const secretValues = environment => [
  ...new Set(
    Object.entries(environment)
      .filter(
        ([name, value]) =>
          isCredentialBearingName(name) &&
          typeof value === 'string' &&
          eligibleCredentialValue(value) &&
          value.length >= 4
      )
      .map(([, value]) => value)
  ),
];
const hasShortCredentialValue = environment =>
  Object.entries(environment).some(
    ([name, value]) =>
      isCredentialBearingName(name) &&
      typeof value === 'string' &&
      eligibleCredentialValue(value) &&
      value.length < 4
  );

export function artifactContainsSecret(
  text,
  environment = process.env,
  parse = true
) {
  if (parse)
    try {
      if (structuredContains(JSON.parse(text), environment)) return true;
    } catch {}
  const labeled = text.matchAll(
    /["']?([A-Za-z][A-Za-z0-9_.-]{2,})["']?\s*[=:]\s*["']?([^\s<>"']+)/g
  );
  const authorization = text.match(
    /\b(?:Proxy-)?Authorization\s*[=:]\s*["']?(?:Bearer|Basic|Token)\s+([^\s<>"']+)/i
  )?.[1];
  return (
    [...labeled].some(
      match =>
        isCredentialBearingName(match[1]) &&
        !(
          /^(?:Proxy[-_.])?Authorization$/i.test(match[1]) &&
          /^(?:Bearer|Basic|Token)$/i.test(match[2])
        ) &&
        hasValue(match[2])
    ) ||
    hasValue(authorization) ||
    /(?:postgres(?:ql)?|redis(?:s)?):\/\/[^\s/:@]+:[^\s/@]+@/i.test(text) ||
    secretValues(environment).some(value => text.includes(value))
  );
}

export function validPlaywrightPng(bytes) {
  try {
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
      return false;
    let offset = 8;
    let state = 0;
    let width;
    let height;
    let channels;
    const compressed = [];
    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + length + 12;
      if (end > bytes.length) return false;
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (
        crc32(bytes.subarray(offset + 4, offset + length + 8)) !==
        bytes.readUInt32BE(offset + length + 8)
      )
        return false;
      const data = bytes.subarray(offset + 8, offset + length + 8);
      if (type === 'IHDR') {
        if (state || length !== 13) return false;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        const colorType = data[9];
        if (
          !width ||
          !height ||
          data[8] !== 8 ||
          (colorType !== 2 && colorType !== 6) ||
          !data.subarray(10).equals(Buffer.from([0, 0, 0]))
        )
          return false;
        channels = colorType === 2 ? 3 : 4;
        state = 1;
      } else if (type === 'IDAT') {
        if (state < 1 || state > 2) return false;
        compressed.push(data);
        state = 2;
      } else if (type === 'IEND') {
        if (state !== 2 || length || end !== bytes.length) return false;
        state = 3;
      } else return false;
      offset = end;
    }
    const rowLength = 1 + width * channels;
    const expected = rowLength * height;
    if (
      state !== 3 ||
      !Number.isSafeInteger(expected) ||
      expected > 100_000_000
    )
      return false;
    const compressedBytes = Buffer.concat(compressed);
    const { buffer: pixels, engine } = inflateSync(compressedBytes, {
      info: true,
      maxOutputLength: expected,
    });
    return (
      engine.bytesWritten === compressedBytes.length &&
      pixels.length === expected &&
      Array.from({ length: height }, (_, row) => pixels[row * rowLength]).every(
        filter => filter <= 4
      )
    );
  } catch {
    return false;
  }
}

function inspect(paths, environment, options = {}) {
  if (hasShortCredentialValue(environment))
    throw new Error('credential value is too short to scan safely');
  const findings = [];
  const records = readRecords(
    paths,
    options.workspace,
    options.allowEmptyPaths
  );
  const omitted = new Set();
  for (const record of records) {
    const extension = extname(record.path).toLowerCase();
    if (FORBIDDEN.has(extension)) {
      findings.push({ path: record.path, category: 'forbidden-container' });
      continue;
    }
    if (
      IMAGES.has(extension) &&
      (extension !== '.png' || !validPlaywrightPng(record.bytes))
    ) {
      findings.push({ path: record.path, category: 'image-policy' });
      continue;
    }
    if (
      !STRUCTURED.has(extension) &&
      !IMAGES.has(extension) &&
      !(extension === '.md' && options.allowMarkdown)
    ) {
      findings.push({ path: record.path, category: 'unknown-binary' });
      continue;
    }
    if (
      IMAGES.has(extension) &&
      secretValues(environment).some(value =>
        record.bytes.includes(Buffer.from(value))
      )
    ) {
      findings.push({ path: record.path, category: 'credential-text' });
      continue;
    }
    if (IMAGES.has(extension)) {
      if (!options.allowImages && !options.omitImages)
        findings.push({ path: record.path, category: 'image-policy' });
      else if (!options.allowImages) omitted.add(record.relativePath);
      continue;
    }
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(record.bytes);
      const values =
        extension === '.json'
          ? [JSON.parse(text)]
          : extension === '.jsonl'
            ? text
                .split(/\r?\n/)
                .filter(Boolean)
                .map(line => JSON.parse(line))
            : [];
      if (
        values.some(value => structuredContains(value, environment)) ||
        artifactContainsSecret(text, environment, values.length === 0)
      )
        findings.push({ path: record.path, category: 'credential-text' });
    } catch {
      findings.push({
        path: record.path,
        category: 'malformed-structured-text',
      });
    }
  }
  return {
    findings,
    omitted,
    records: records.filter(record => !omitted.has(record.relativePath)),
  };
}

export function inspectPlaywrightArtifacts(
  paths,
  environment = process.env,
  options = {}
) {
  return inspect(paths, environment, options).findings;
}

export function guardPlaywrightArtifacts(
  paths,
  environment = process.env,
  options = {}
) {
  return inspectPlaywrightArtifacts(paths, environment, options).map(
    item => item.path
  );
}

const pathExists = path =>
  lstatSync(path, { throwIfNoEntry: false }) !== undefined;

const GLOB_MAGIC = /[*?[\]{}()!+@]/;

function positiveSearchRoot(entry, root) {
  const lexical = resolve(root, entry);
  if (!isInside(root, lexical)) throw new Error('pattern outside root');
  const stat = lstatSync(lexical, { throwIfNoEntry: false });
  if (stat) {
    if (stat.isSymbolicLink() || realpathSync(lexical) !== lexical)
      throw new Error('symlinked path');
    if (stat.isDirectory()) return lexical;
    if (stat.isFile()) return dirname(lexical);
    throw new Error('non-regular path');
  }
  const magic = entry.search(GLOB_MAGIC);
  if (magic < 0) return dirname(lexical);
  const separator = Math.max(
    entry.lastIndexOf('/', magic),
    entry.lastIndexOf('\\', magic)
  );
  const searchRoot = resolve(
    root,
    separator < 0 ? '.' : entry.slice(0, separator)
  );
  if (!isInside(root, searchRoot)) throw new Error('pattern outside root');
  return searchRoot;
}

function uploadSearchRoot(paths, rootPath) {
  const root = canonicalRoot(rootPath);
  const roots = paths
    .filter(entry => !entry.startsWith('!'))
    .map(entry => positiveSearchRoot(entry, root));
  if (roots.length === 0) throw new Error('artifact has no positive path');
  let common = roots[0];
  while (!roots.every(path => isInside(common, path))) {
    const parent = dirname(common);
    if (parent === common || !isInside(root, parent))
      throw new Error('artifact search roots have no safe ancestor');
    common = parent;
  }
  if (!isInside(root, common))
    throw new Error('artifact root outside workspace');
  return common;
}

function uploadRecords(paths, rootPath, records) {
  const root = uploadSearchRoot(paths, rootPath);
  return records.map(record => {
    const relativePath = relative(root, record.path);
    if (!relativePath || !isInside(root, record.path))
      throw new Error('unsafe upload payload path');
    return { ...record, relativePath };
  });
}

function stageRecords(destination, records, priorStage, omitted = []) {
  const runnerTemp = canonicalRoot(process.env.RUNNER_TEMP);
  const target = resolve(destination);
  if (
    !isInside(runnerTemp, target) ||
    pathExists(target) ||
    realpathSync(dirname(target)) !== dirname(target)
  )
    throw new Error('unsafe stage destination');
  const partial = target + '.pending-' + process.pid + '-' + Date.now();
  mkdirSync(partial, { mode: 0o700 });
  const union = new Map(
    priorStage && readdirSync(priorStage).length
      ? readRecords(['.'], priorStage).map(item => [
          item.relativePath,
          item.bytes,
        ])
      : []
  );
  for (const name of omitted) union.delete(name);
  for (const record of records) {
    union.set(record.relativePath, record.bytes);
  }
  const directories = new Set([partial]);
  for (const [name, bytes] of union) {
    const output = resolve(partial, name);
    if (!isInside(partial, output)) throw new Error('unsafe output path');
    mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
    writeFileSync(output, bytes, { flag: 'wx', mode: 0o400 });
    for (
      let path = dirname(output);
      isInside(partial, path);
      path = dirname(path)
    )
      directories.add(path);
  }
  for (const path of [...directories]
    .filter(path => path !== partial)
    .sort((left, right) => right.length - left.length))
    chmodSync(path, 0o500);
  renameSync(partial, target);
  chmodSync(target, 0o500);
  return target;
}

const binding = () =>
  [
    process.env.GITHUB_RUN_ID,
    process.env.GITHUB_RUN_ATTEMPT,
    process.env.GITHUB_JOB,
  ].join(':');

function producerRoot() {
  const runnerTemp = canonicalRoot(process.env.RUNNER_TEMP);
  const root = resolve(runnerTemp, 'safe-playwright-producer');
  if (!pathExists(root)) mkdirSync(root, { mode: 0o700 });
  if (
    !isInside(runnerTemp, root) ||
    realpathSync(root) !== root ||
    !lstatSync(root).isDirectory()
  )
    throw new Error('unsafe producer root');
  return root;
}

function currentStage(root) {
  const pointer = resolve(root, 'current');
  if (!pathExists(pointer)) return undefined;
  const stat = lstatSync(pointer);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    realpathSync(pointer) !== pointer
  )
    throw new Error('invalid current pointer');
  const [currentBinding, name, extra] = readFileSync(pointer, 'utf8')
    .trim()
    .split('|');
  if (currentBinding !== binding() || extra || !/^stage-\d+-\d+$/.test(name))
    throw new Error('stale current pointer');
  const stage = resolve(root, name);
  if (
    !isInside(root, stage) ||
    realpathSync(stage) !== stage ||
    !lstatSync(stage).isDirectory()
  )
    throw new Error('invalid current stage');
  return stage;
}

function atomicWrite(path, contents) {
  const temporary = path + '.' + process.pid + '.' + Date.now();
  writeFileSync(temporary, contents, { flag: 'wx', mode: 0o400 });
  renameSync(temporary, path);
}

function poison(root) {
  try {
    writeFileSync(resolve(root, 'blocked'), '1', { flag: 'wx', mode: 0o400 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
}

const options = () => ({
  allowImages: process.env.PLAYWRIGHT_ARTIFACT_ALLOW_IMAGES === 'true',
  allowMarkdown: process.env.PLAYWRIGHT_ARTIFACT_ALLOW_MARKDOWN === 'true',
});

function configuredPaths() {
  const paths = (process.env.PLAYWRIGHT_ARTIFACT_PATHS ?? '')
    .split(/\r?\n/)
    .map(path => path.trim())
    .filter(Boolean);
  return paths.length ? paths : DEFAULT_PATHS;
}

function report(findings) {
  const counts = new Map();
  for (const { category } of findings)
    counts.set(category, (counts.get(category) ?? 0) + 1);
  const categories = [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => category + ':' + count)
    .join(',');
  console.error(
    `PLAYWRIGHT_ARTIFACT_SECRET_EXPOSURE: blocked ${findings.length} unsafe or unverifiable Playwright artifact file(s); categories=${categories}`
  );
}

function runProducer(command) {
  let root;
  let childStatus = 0;
  try {
    root = producerRoot();
    const pending = resolve(root, 'pending');
    if (pathExists(resolve(root, 'blocked')) || pathExists(pending)) {
      poison(root);
      throw new Error('poisoned producer state');
    }
    const priorStage = currentStage(root);
    writeFileSync(pending, binding(), { flag: 'wx', mode: 0o400 });
    if (hasShortCredentialValue(process.env))
      throw new Error('credential value is too short to mask safely');
    for (const value of secretValues(process.env)) {
      const escaped = value
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A');
      writeSync(process.stdout.fd, '::add-mask::' + escaped + '\n');
    }
    const child = spawnSync(command[0], command.slice(1), {
      env: process.env,
      stdio: 'inherit',
    });
    childStatus = child.status ?? 1;
    const configured = configuredPaths();
    const result = inspect(configured, process.env, {
      ...options(),
      allowEmptyPaths: !(process.env.PLAYWRIGHT_ARTIFACT_PATHS ?? '').trim(),
      omitImages: true,
    });
    if (result.findings.length) {
      poison(root);
      report(result.findings);
      return childStatus || 1;
    }
    const stageName = 'stage-' + Date.now() + '-' + process.pid;
    stageRecords(
      resolve(root, stageName),
      result.records,
      priorStage,
      result.omitted
    );
    atomicWrite(resolve(root, 'current'), binding() + '|' + stageName + '\n');
    rmSync(pending);
    console.log('Playwright artifact secret guard passed.');
    return childStatus;
  } catch {
    if (root) poison(root);
    report([{ category: 'inspection-error' }]);
    return childStatus || 1;
  }
}

if (import.meta.filename === process.argv[1]) {
  const cli = process.argv.slice(2);
  if (cli[0] === '--run') {
    if (cli[1] !== '--' || !cli[2]) {
      report([{ category: 'inspection-error' }]);
      process.exit(1);
    }
    process.exit(runProducer(cli.slice(2)));
  }
  try {
    const paths = cli.length ? cli : configuredPaths();
    const workspace = canonicalRoot();
    const result = inspect(paths, process.env, { ...options(), workspace });
    if (result.findings.length) {
      report(result.findings);
      process.exit(1);
    }
    if (process.env.PLAYWRIGHT_ARTIFACT_STAGE_DIR)
      stageRecords(
        process.env.PLAYWRIGHT_ARTIFACT_STAGE_DIR,
        uploadRecords(paths, workspace, result.records)
      );
    console.log('Playwright artifact secret guard passed.');
  } catch {
    report([{ category: 'inspection-error' }]);
    process.exit(1);
  }
}
