import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vercel CLI 59.23.2 (vercel/vercel#17386) leaves filePathMap entries in
// .vc-config.json when it refuses to upload them. Remote init then lstats
// those paths during extract and dies at errorStep=build-container-init.
// The decision uses the ignore implementation bundled in that CLI, not a
// newer ignore package from the repo.
const FILEPATHMAP_VERCELIGNORE_EXCEPTIONS = [
  'node_modules',
  '.next',
  '.yarn/cache',
  '.pnp*',
  '.venv',
  'venv',
  '__pycache__',
  '/target',
];

const IGNORE_FACTORY_MARKER = 'var require_ignore=__commonJS({';

function clearRelative(str) {
  return str.replace(/(\n|^)\.\//g, '$1');
}

function posix(rel) {
  return rel.split(sep).join('/');
}

let bundledIgnore;

function loadBundledIgnore() {
  if (bundledIgnore) return bundledIgnore;
  const vercelPkg = createRequire(import.meta.url).resolve(
    'vercel/package.json'
  );
  const chunksDir = join(vercelPkg, '..', 'dist', 'chunks');
  let source = '';
  for (const name of readdirSync(chunksDir)) {
    if (!name.endsWith('.js')) continue;
    const chunk = readFileSync(join(chunksDir, name), 'utf8');
    if (chunk.includes(IGNORE_FACTORY_MARKER)) {
      source = chunk;
      break;
    }
  }
  const start = source.indexOf(IGNORE_FACTORY_MARKER);
  if (start < 0) {
    throw new Error(
      'Installed Vercel CLI does not expose the bundled ignore implementation used for prebuilt filePathMap filtering.'
    );
  }
  const factory = source.indexOf('(exports,module){', start);
  const version = source
    .slice(start, factory)
    .match(/ignore@(\d+\.\d+\.\d+)/)?.[1];
  if (factory < 0 || !version) {
    throw new Error(
      'Installed Vercel CLI ignore bundle could not be identified.'
    );
  }
  let depth = 0;
  let inStr = null;
  let end = factory + '(exports,module)'.length;
  for (; end < source.length; end++) {
    const char = source[end];
    if (inStr) {
      if (char === '\\') {
        end += 1;
        continue;
      }
      if (char === inStr) inStr = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      inStr = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }
  const body = source.slice(factory + '(exports,module)'.length, end - 1);
  if (!body.includes('module.exports')) {
    throw new Error(
      'Installed Vercel CLI ignore bundle did not finish loading.'
    );
  }
  const module = { exports: {} };
  new Function('exports', 'module', body)(module.exports, module);
  if (typeof module.exports !== 'function') {
    throw new Error('Installed Vercel CLI ignore bundle did not export.');
  }
  bundledIgnore = { ignore: module.exports, version };
  return bundledIgnore;
}

export function bundledIgnoreVersion() {
  return loadBundledIgnore().version;
}

function readOptional(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

function userIgnore(root) {
  const vercelignore = readOptional(join(root, '.vercelignore'));
  const nowignore = readOptional(join(root, '.nowignore'));
  if (vercelignore && nowignore) {
    throw new Error(
      'CONFLICTING_IGNORE_FILES: Cannot use both a `.vercelignore` and `.nowignore` file.'
    );
  }
  const ignoreFile = vercelignore || nowignore;
  if (!ignoreFile) return null;
  return loadBundledIgnore().ignore().add(clearRelative(ignoreFile));
}

function exceptionIgnore() {
  return loadBundledIgnore()
    .ignore()
    .add(FILEPATHMAP_VERCELIGNORE_EXCEPTIONS.join('\n'));
}

function isUploadedPrebuiltFile(root, absPath) {
  let stat;
  try {
    stat = lstatSync(absPath);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!stat.isFile()) return false;
  const rel = posix(relative(root, absPath));
  return rel === '.vercel/output' || rel.startsWith('.vercel/output/');
}

// Mirrors buildFileTree2 in the CLI: outside-root refs are skipped, and
// user-ignored refs are skipped unless they match a default exception or
// are already in the prebuilt upload set (.vercel/output).
export function filePathMapEntryOmitted(value, { root, userIg, exceptions }) {
  const absPath = join(root, value);
  const rel = relative(root, absPath);
  const posixRel = posix(rel);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { omit: true, posixRel };
  }
  if (
    userIg &&
    userIg.ignores(posixRel) &&
    !exceptions.ignores(posixRel) &&
    !isUploadedPrebuiltFile(root, absPath)
  ) {
    return { omit: true, posixRel };
  }
  return { omit: false, posixRel };
}

function collectConfigs(directory, found) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (entry.name === '.vc-config.json') {
        throw new Error(`Refusing to prune symlinked ${path}`);
      }
      continue;
    }
    if (entry.isDirectory()) collectConfigs(path, found);
    else if (entry.isFile() && entry.name === '.vc-config.json')
      found.push(path);
  }
}

export function pruneIgnoredFilePathMap(root) {
  root = resolve(root);
  const output = join(root, '.vercel', 'output');
  let outputStat;
  try {
    outputStat = lstatSync(output);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    outputStat = null;
  }
  if (!outputStat || !outputStat.isDirectory() || outputStat.isSymbolicLink()) {
    throw new Error('Prebuilt output root must be a real directory');
  }
  const userIg = userIgnore(root);
  const exceptions = exceptionIgnore();
  const configs = [];
  collectConfigs(output, configs);
  const removed = [];
  for (const path of configs) {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    if (!config.filePathMap) continue;
    let changed = false;
    const nextMap = {};
    for (const [key, value] of Object.entries(config.filePathMap)) {
      if (typeof value !== 'string') {
        throw new Error(
          `filePathMap value for ${key} in ${path} must be a string`
        );
      }
      const decision = filePathMapEntryOmitted(value, {
        root,
        userIg,
        exceptions,
      });
      if (decision.omit) {
        changed = true;
        removed.push(decision.posixRel);
        continue;
      }
      nextMap[key] = value;
    }
    if (!changed) continue;
    config.filePathMap = nextMap;
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  }
  return { removed, configCount: configs.length };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { removed } = pruneIgnoredFilePathMap(process.cwd());
  const unique = [...new Set(removed)].sort((a, b) => a.localeCompare(b));
  console.log(
    `Pruned ${removed.length} prebuilt filePathMap ${
      removed.length === 1 ? 'entry' : 'entries'
    } the Vercel CLI would omit from the archive (${unique.length} paths).`
  );
  for (const path of unique.slice(0, 20)) console.log(`  ${path}`);
  if (unique.length > 20) console.log(`  …and ${unique.length - 20} more`);
}
