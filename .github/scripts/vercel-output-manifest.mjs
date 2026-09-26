// Read-only diagnostic manifest of the prebuilt Vercel upload.
//
// `vercel deploy --prebuilt --archive=tgz` packs, relative to the project
// root, every entry under `.vercel/output` plus every `filePathMap` target
// named by a function's `.vc-config.json` (see vercel-prebuilt-deploy.sh).
// When Vercel's remote build dies at "Extracting deployment files" nothing
// records what was uploaded, so a failure cannot be diffed against the last
// success. This walks that tree WITHOUT following symlinks and reports shape
// only: names, sizes, modes, link targets. It never reads file contents
// (except `.vc-config.json`, parsed for its filePathMap) and never prints
// environment values.
//
//   node vercel-output-manifest.mjs [--root DIR] [--json FILE]
//   node vercel-output-manifest.mjs --summary FILE   (one line from a manifest)

import {
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'jovie-vercel-output-manifest/v1';
const OUTPUT_DIR = '.vercel/output';
const TOP_LARGEST = 20;
const TOP_LONGEST = 10;
const LIST_CAP = 200;
const RESERVED = /[<>:"|?*\\]/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const NON_ASCII = /[^\u0000-\u007f]/u;

const S_ISUID = 0o4000;
const S_ISGID = 0o2000;
const S_ISVTX = 0o1000;

const toPosix = path => path.split(sep).join('/');
const bytes = value => Buffer.byteLength(value, 'utf8');
const octal = mode => `0${(mode & 0o7777).toString(8).padStart(3, '0')}`;

function entryType(stat) {
  if (stat.isFile()) return 'file';
  if (stat.isDirectory()) return 'directory';
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isFIFO()) return 'fifo';
  if (stat.isSocket()) return 'socket';
  if (stat.isBlockDevice()) return 'block-device';
  if (stat.isCharacterDevice()) return 'char-device';
  return 'unknown';
}

// Whether the path fits a POSIX ustar header (name <= 100 bytes, optionally
// split at a "/" into prefix <= 155 bytes). Longer paths need PAX/GNU
// extensions, which is one thing an extractor may reject.
export function fitsUstar(path) {
  const size = bytes(path);
  if (size <= 100) return true;
  if (size > 256) return false;
  for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1)) {
    if (bytes(path.slice(0, i)) <= 155 && bytes(path.slice(i + 1)) <= 100)
      return true;
  }
  return false;
}

// Segments longer than NAME_MAX (255 bytes on ext4/APFS/NTFS). Such names
// cannot exist on the runner's filesystem, but the check is kept so a
// different build host or a pathological generator shows up here.
export function oversizedSegments(path, limit = 255) {
  return path
    .split('/')
    .map(bytes)
    .filter(size => size > limit);
}

export function nameFlags(path) {
  const flags = [];
  if (NON_ASCII.test(path)) flags.push('non-ascii');
  if (CONTROL.test(path)) flags.push('control');
  if (path.split('/').some(segment => RESERVED.test(segment)))
    flags.push('reserved');
  if (path.split('/').some(segment => /[ .]$/u.test(segment)))
    flags.push('trailing-dot-or-space');
  return flags;
}

function within(parent, child) {
  const rel = relative(parent, child);
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function createCollector(root) {
  return {
    root,
    entries: 0,
    files: 0,
    directories: 0,
    symlinks: 0,
    special: 0,
    totalBytes: 0,
    emptyDirectories: 0,
    errors: [],
    records: [],
    symlinkRecords: [],
    unusualModes: [],
    inodes: new Map(),
  };
}

function record(collector, absolute, stat, outputRoot) {
  const path = toPosix(relative(collector.root, absolute));
  const type = entryType(stat);
  collector.entries += 1;
  const item = {
    path,
    type,
    size: type === 'file' ? stat.size : 0,
    mode: octal(stat.mode),
  };
  collector.records.push(item);
  if (type === 'file') {
    collector.files += 1;
    collector.totalBytes += stat.size;
    if (stat.nlink > 1) {
      const key = `${stat.dev}:${stat.ino}`;
      const group = collector.inodes.get(key) ?? {
        nlink: stat.nlink,
        paths: [],
      };
      group.paths.push(path);
      collector.inodes.set(key, group);
    }
  } else if (type === 'directory') {
    collector.directories += 1;
  } else if (type === 'symlink') {
    collector.symlinks += 1;
    let target = null;
    try {
      target = readlinkSync(absolute);
    } catch (error) {
      collector.errors.push({ path, code: error.code ?? 'READLINK' });
    }
    const resolved =
      target === null ? null : resolve(dirname(absolute), target);
    let dangling = true;
    let targetType = null;
    if (resolved) {
      try {
        // Classify the target without descending into it.
        targetType = entryType(statSync(resolved));
        dangling = false;
      } catch {
        dangling = true;
      }
    }
    collector.symlinkRecords.push({
      path,
      target,
      targetType,
      absolute: target !== null && isAbsolute(target),
      escapesOutput:
        resolved !== null &&
        outputRoot !== null &&
        !within(outputRoot, resolved),
      escapesRoot: resolved !== null && !within(collector.root, resolved),
      dangling,
    });
  } else {
    collector.special += 1;
  }
  const special = stat.mode & (S_ISUID | S_ISGID | S_ISVTX);
  const reasons = [];
  if (stat.mode & S_ISUID) reasons.push('setuid');
  if (stat.mode & S_ISGID) reasons.push('setgid');
  if (stat.mode & S_ISVTX) reasons.push('sticky');
  if (!['file', 'directory', 'symlink'].includes(type)) reasons.push(type);
  if ((type === 'file' || type === 'directory') && !(stat.mode & 0o400))
    reasons.push('owner-unreadable');
  if (type === 'directory' && !(stat.mode & 0o100))
    reasons.push('owner-untraversable');
  if (special || reasons.length > 0)
    collector.unusualModes.push({
      path,
      type,
      mode: octal(stat.mode),
      reasons,
    });
}

function walk(collector, directory, outputRoot, configs) {
  let names;
  try {
    names = readdirSync(directory).sort();
  } catch (error) {
    collector.errors.push({
      path: toPosix(relative(collector.root, directory)),
      code: error.code ?? 'READDIR',
    });
    return;
  }
  if (names.length === 0) collector.emptyDirectories += 1;
  for (const name of names) {
    const absolute = join(directory, name);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      collector.errors.push({
        path: toPosix(relative(collector.root, absolute)),
        code: error.code ?? 'LSTAT',
      });
      continue;
    }
    record(collector, absolute, stat, outputRoot);
    if (stat.isDirectory()) walk(collector, absolute, outputRoot, configs);
    else if (stat.isFile() && name === '.vc-config.json')
      configs.push(absolute);
  }
}

function readFilePathMapTargets(root, configs, errors) {
  const targets = new Set();
  let references = 0;
  for (const config of configs) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(config, 'utf8'));
    } catch {
      errors.push({
        path: toPosix(relative(root, config)),
        code: 'VC_CONFIG_PARSE',
      });
      continue;
    }
    for (const target of Object.values(parsed?.filePathMap ?? {})) {
      references += 1;
      targets.add(String(target));
    }
  }
  return { targets: [...targets].sort(), references, configs: configs.length };
}

function summarize(collector) {
  const { records } = collector;
  const byPathBytes = (a, b) =>
    b.pathBytes - a.pathBytes || a.path.localeCompare(b.path);
  const measured = records.map(({ path }) => ({
    path,
    chars: [...path].length,
    pathBytes: bytes(path),
  }));
  const longest = [...measured].sort(byPathBytes).slice(0, TOP_LONGEST);
  const largest = records
    .filter(item => item.type === 'file')
    .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
    .slice(0, TOP_LARGEST)
    .map(({ path, size }) => ({ path, size }));
  const longSegments = [];
  const unusualNames = [];
  const casefold = new Map();
  let ustarOverflow = 0;
  let over100Bytes = 0;
  for (const { path } of records) {
    for (const segmentBytes of oversizedSegments(path))
      longSegments.push({ path, segmentBytes });
    const flags = nameFlags(path);
    if (flags.length > 0) unusualNames.push({ path, flags });
    const folded = path.toLowerCase();
    casefold.set(folded, [...(casefold.get(folded) ?? []), path]);
    if (bytes(path) > 100) over100Bytes += 1;
    if (!fitsUstar(path)) ustarOverflow += 1;
  }
  const caseCollisions = [...casefold.values()].filter(
    paths => paths.length > 1
  );
  const hardlinks = [...collector.inodes.values()]
    .map(group => ({ nlink: group.nlink, paths: group.paths.sort() }))
    .sort((a, b) => a.paths[0].localeCompare(b.paths[0]));
  const links = collector.symlinkRecords;
  return {
    totals: {
      entries: collector.entries,
      files: collector.files,
      directories: collector.directories,
      symlinks: collector.symlinks,
      special: collector.special,
      totalBytes: collector.totalBytes,
      emptyDirectories: collector.emptyDirectories,
      errors: collector.errors.length,
    },
    symlinks: {
      count: links.length,
      absolute: links.filter(link => link.absolute).length,
      escapesOutput: links.filter(link => link.escapesOutput).length,
      escapesRoot: links.filter(link => link.escapesRoot).length,
      dangling: links.filter(link => link.dangling).length,
      toFiles: links.filter(link => link.targetType === 'file').length,
      entries: links.slice(0, LIST_CAP),
      truncated: links.length > LIST_CAP,
    },
    largestFiles: largest,
    longestPath: longest[0] ?? null,
    longestPaths: longest,
    paths: { over100Bytes, ustarOverflow },
    longSegments: longSegments.slice(0, LIST_CAP),
    unusualNames: {
      count: unusualNames.length,
      entries: unusualNames.slice(0, LIST_CAP),
    },
    caseCollisions: {
      count: caseCollisions.length,
      entries: caseCollisions.slice(0, LIST_CAP),
    },
    hardlinks: {
      groups: hardlinks.length,
      entries: hardlinks.slice(0, LIST_CAP),
    },
    unusualModes: {
      count: collector.unusualModes.length,
      entries: collector.unusualModes.slice(0, LIST_CAP),
    },
    errors: collector.errors.slice(0, LIST_CAP),
  };
}

function describeTargets(root, outputRoot, targets) {
  const collector = createCollector(root);
  const outside = [];
  for (const target of targets) {
    const absolute = resolve(root, target);
    if (!within(root, absolute)) {
      outside.push(target);
      continue;
    }
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      collector.errors.push({
        path: toPosix(target),
        code: error.code ?? 'LSTAT',
      });
      continue;
    }
    // A traced directory is recorded, not walked: Vercel packs the named path.
    record(collector, absolute, stat, outputRoot);
  }
  return { outside, collector };
}

export function buildManifest({ root = process.cwd() } = {}) {
  const started = Date.now();
  const projectRoot = resolve(root);
  const outputRoot = resolve(projectRoot, OUTPUT_DIR);
  const manifest = {
    schema: SCHEMA,
    archiveRoot: '.',
    outputDir: OUTPUT_DIR,
    exists: false,
  };
  let rootStat;
  try {
    rootStat = lstatSync(outputRoot);
  } catch {
    return { ...manifest, durationMs: Date.now() - started };
  }
  manifest.exists = true;
  manifest.outputDirType = entryType(rootStat);
  const collector = createCollector(projectRoot);
  const configs = [];
  if (rootStat.isDirectory()) walk(collector, outputRoot, outputRoot, configs);
  manifest.output = summarize(collector);
  const traced = readFilePathMapTargets(projectRoot, configs, collector.errors);
  const inOutput = traced.targets.filter(target =>
    within(outputRoot, resolve(projectRoot, target))
  );
  const external = traced.targets.filter(
    target => !within(outputRoot, resolve(projectRoot, target))
  );
  const described = describeTargets(projectRoot, outputRoot, external);
  manifest.filePathMap = {
    configs: traced.configs,
    references: traced.references,
    uniqueTargets: traced.targets.length,
    targetsInsideOutput: inOutput.length,
    targetsOutsideRoot: described.outside.slice(0, LIST_CAP),
    ...summarize(described.collector),
  };
  manifest.output.totals.errors = collector.errors.length;
  manifest.output.errors = collector.errors.slice(0, LIST_CAP);
  manifest.durationMs = Date.now() - started;
  return manifest;
}

// Names are JSON-quoted so control characters cannot forge log lines or
// workflow commands; every line carries a fixed prefix.
const q = value => JSON.stringify(value);

function sectionLines(label, section) {
  const t = section.totals;
  const lines = [
    `${label}: entries=${t.entries} files=${t.files} dirs=${t.directories} symlinks=${t.symlinks} special=${t.special} bytes=${t.totalBytes} emptyDirs=${t.emptyDirectories} errors=${t.errors}`,
    `${label} symlinks: absolute=${section.symlinks.absolute} escapesOutput=${section.symlinks.escapesOutput} escapesRoot=${section.symlinks.escapesRoot} dangling=${section.symlinks.dangling} toFiles=${section.symlinks.toFiles}`,
  ];
  for (const link of section.symlinks.entries.slice(0, 20)) {
    const flags = [
      'absolute',
      'escapesOutput',
      'escapesRoot',
      'dangling',
    ].filter(flag => link[flag]);
    lines.push(
      `  link ${q(link.path)} -> ${q(link.target)} (${link.targetType ?? 'missing'}${flags.length ? `; ${flags.join(',')}` : ''})`
    );
  }
  if (section.longestPath) {
    lines.push(
      `${label} longest path: chars=${section.longestPath.chars} bytes=${section.longestPath.pathBytes} over100Bytes=${section.paths.over100Bytes} ustarOverflow=${section.paths.ustarOverflow}`
    );
    for (const item of section.longestPaths)
      lines.push(`  long ${item.pathBytes}B ${q(item.path)}`);
  }
  for (const item of section.largestFiles)
    lines.push(`  large ${item.size}B ${q(item.path)}`);
  lines.push(
    `${label} anomalies: segments>255B=${section.longSegments.length} unusualNames=${section.unusualNames.count} caseCollisions=${section.caseCollisions.count} hardlinkGroups=${section.hardlinks.groups} unusualModes=${section.unusualModes.count}`
  );
  for (const item of section.longSegments.slice(0, 10))
    lines.push(`  segment ${item.segmentBytes}B ${q(item.path)}`);
  for (const item of section.unusualNames.entries.slice(0, 10))
    lines.push(`  name [${item.flags.join(',')}] ${q(item.path)}`);
  for (const group of section.caseCollisions.entries.slice(0, 10))
    lines.push(`  case ${group.map(q).join(' ')}`);
  for (const group of section.hardlinks.entries.slice(0, 10))
    lines.push(
      `  hardlink nlink=${group.nlink} ${group.paths.map(q).join(' ')}`
    );
  for (const item of section.unusualModes.entries.slice(0, 10))
    lines.push(
      `  mode ${item.mode} ${item.type} [${item.reasons.join(',')}] ${q(item.path)}`
    );
  for (const item of section.errors.slice(0, 10))
    lines.push(`  error ${item.code} ${q(item.path)}`);
  return lines;
}

export function formatReport(manifest) {
  const lines = [];
  if (!manifest.exists) {
    lines.push(`${manifest.outputDir} missing`);
  } else {
    lines.push(
      `${manifest.outputDir} (${manifest.outputDirType}) scanned in ${manifest.durationMs}ms`
    );
    lines.push(...sectionLines('output', manifest.output));
    const fpm = manifest.filePathMap;
    lines.push(
      `filePathMap: configs=${fpm.configs} references=${fpm.references} unique=${fpm.uniqueTargets} insideOutput=${fpm.targetsInsideOutput} outsideRoot=${fpm.targetsOutsideRoot.length}`
    );
    lines.push(...sectionLines('traced', fpm));
  }
  return lines.map(line => `vercel-output-manifest| ${line}`).join('\n');
}

export function summaryLine(manifest) {
  if (!manifest.exists)
    return `Vercel output manifest: ${manifest.outputDir} missing`;
  const out = manifest.output;
  const fpm = manifest.filePathMap;
  const fields = {
    entries: out.totals.entries,
    files: out.totals.files,
    dirs: out.totals.directories,
    symlinks: out.totals.symlinks,
    escaping: out.symlinks.escapesOutput,
    absolute: out.symlinks.absolute,
    special: out.totals.special,
    bytes: out.totals.totalBytes,
    maxPathBytes: out.longestPath?.pathBytes ?? 0,
    ustarOverflow: out.paths.ustarOverflow,
    longSegments: out.longSegments.length,
    oddNames: out.unusualNames.count,
    caseDupes: out.caseCollisions.count,
    hardlinks: out.hardlinks.groups,
    oddModes: out.unusualModes.count,
    tracedUnique: fpm.uniqueTargets,
    tracedFiles: fpm.totals.files,
    tracedSymlinks: fpm.totals.symlinks,
    tracedBytes: fpm.totals.totalBytes,
    tracedMissing: fpm.totals.errors,
    tracedMaxPathBytes: fpm.longestPath?.pathBytes ?? 0,
  };
  return `Vercel output manifest: ${Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')}`;
}

export function main(argv, { cwd = process.cwd(), log = console.log } = {}) {
  const args = [...argv];
  const take = flag => {
    const index = args.indexOf(flag);
    if (index === -1) return undefined;
    const value = args[index + 1];
    if (value === undefined) throw new Error(`${flag} requires a value`);
    args.splice(index, 2);
    return value;
  };
  const summaryFile = take('--summary');
  if (summaryFile !== undefined) {
    log(summaryLine(JSON.parse(readFileSync(summaryFile, 'utf8'))));
    return 0;
  }
  const root = resolve(cwd, take('--root') ?? '.');
  const jsonFile = take('--json');
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(' ')}`);
  const manifest = buildManifest({ root });
  log(formatReport(manifest));
  log(summaryLine(manifest));
  if (jsonFile)
    writeFileSync(jsonFile, `${JSON.stringify(manifest, null, 2)}\n`);
  return 0;
}

/* c8 ignore start */
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`vercel-output-manifest: ${error.message}`);
    process.exitCode = 1;
  }
}
/* c8 ignore stop */
