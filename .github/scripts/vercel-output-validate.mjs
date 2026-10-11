// One-pass validator for the prebuilt Vercel upload (`.vercel/output` plus
// every `filePathMap` target named by a function's `.vc-config.json`).
// Read-only and deterministic: no network, no secrets, no writes.
//
//   node .github/scripts/vercel-output-validate.mjs [--root DIR]
//
// Exits 0 when the output satisfies every extraction invariant and 1 with one
// line per violation otherwise, so a packaging defect never needs the
// serial one-error-per-deploy loop that froze production for five days
// (postmortem docs/postmortems/2026-09-26-production-freeze.md).
//
// Invariants, each encoding an observed post-merge failure:
//   path-escape             No filePathMap key or value resolves outside the
//                           upload archive root — the directory holding
//                           `.vercel/output` (this repo's root; the Vercel
//                           project's deploy context). #18220 traced `../../`
//                           paths; #18616 staged them into runtime-data.
//   file-symlink            No file-symlink targets in function traces. The
//                           tgz carries them as link entries and remote
//                           extraction dies with "Unexpected error". #18543.
//   through-directory-link  No map entry whose source path resolves through a
//                           symlinked directory (pnpm's hoisted
//                           .pnpm/node_modules layer): the archive holds the
//                           directory link and a file beneath it, which Vercel
//                           rejects ("... is not a valid path"). #18740.
//   dangling-directory-link No directory symlink whose real target contributes
//                           no uploaded file; the link arrives dangling and
//                           "Deploying outputs" fails ENOENT. #18749.
//   key-under-linked-key    No file key beneath a key that is itself a linked
//                           directory; the entry would be written through the
//                           link. #18755.
//   traced-path-missing     Every traced path exists.
//   vercelignore-dropped    No traced repository path is matched by the root
//                           `.vercelignore` (CLI >= 59 silently drops matched
//                           filePathMap entries from the upload). #18384.
//                           Dependency/build payloads (`node_modules`,
//                           `.next`) are always packed from the trace, so they
//                           are exempt from this check; the observed drops
//                           were repository files (CHANGELOG.md,
//                           docs/FEATURE_REGISTRY.md, tests/quarantine.json).

import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = '.vercel/output';
const q = value => JSON.stringify(value);

function within(parent, child) {
  const rel = relative(parent, child);
  return (
    rel === '' ||
    (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

const toPosix = path => path.split(sep).join('/');

// Minimal gitignore matcher for the repository `.vercelignore`: comments,
// `!` negation (last match wins), trailing `/` directory-only patterns,
// leading-`/` or mid-pattern-slash anchoring to the ignore file's directory,
// `*`/`?`/`[...]`, and `**`. Unanchored patterns match at any depth. A match
// on an ancestor directory covers the path (directory exclusion prunes its
// subtree), and re-inclusion patterns may match the path itself.
function globToRegExp(pattern) {
  let source = '^';
  let i = 0;
  while (i < pattern.length) {
    if (pattern.startsWith('**/', i)) {
      source += '(?:[^/]+/)*';
      i += 3;
    } else if (pattern.startsWith('**', i)) {
      source += '.*';
      i += 2;
    } else if (pattern[i] === '*') {
      source += '[^/]*';
      i += 1;
    } else if (pattern[i] === '?') {
      source += '[^/]';
      i += 1;
    } else if (pattern[i] === '[') {
      const end = pattern.indexOf(']', i + 1);
      if (end === -1) {
        source += '\\[';
        i += 1;
      } else {
        source += pattern.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      source += pattern[i].replace(/[.+^${}()|\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp(`${source}$`);
}

export function compileIgnore(source) {
  const rules = [];
  for (const raw of source.split('\n')) {
    let line = raw.replace(/\r$/, '').trimEnd();
    if (line === '' || line.startsWith('#')) continue;
    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    }
    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    let pattern = line;
    if (pattern.startsWith('/')) pattern = pattern.slice(1);
    const anchored = line.includes('/');
    if (!anchored) pattern = `**/${pattern}`;
    rules.push({ negated, dirOnly, regex: globToRegExp(pattern) });
  }
  return {
    ignores(path, isDirectory = false) {
      const posix = toPosix(path);
      const candidates = [posix];
      for (
        let at = posix.indexOf('/');
        at !== -1;
        at = posix.indexOf('/', at + 1)
      ) {
        candidates.push(posix.slice(0, at));
      }
      let ignored = false;
      for (const rule of rules) {
        for (const candidate of candidates) {
          if (rule.dirOnly && candidate === posix && !isDirectory) continue;
          if (rule.regex.test(candidate)) ignored = !rule.negated;
        }
      }
      return ignored;
    },
  };
}

function collectFunctionConfigs(outputRoot, violations) {
  const configs = [];
  const walk = directory => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      // Linked .func directories alias a sibling already walked on its own.
      if (stat.isDirectory()) walk(path);
      else if (name === '.vc-config.json' && stat.isFile()) configs.push(path);
    }
  };
  let functionsStat;
  try {
    functionsStat = lstatSync(resolve(outputRoot, 'functions'));
  } catch (error) {
    if (error.code === 'ENOENT') return configs;
    throw error;
  }
  if (functionsStat.isDirectory()) walk(resolve(outputRoot, 'functions'));
  else if (functionsStat.isSymbolicLink()) {
    violations.push({
      invariant: 'output-shape',
      config: null,
      detail: `${OUTPUT_DIR}/functions must be a real directory, found symlink`,
    });
  }
  return configs;
}

export function validateVercelOutput({ root = process.cwd() } = {}) {
  // Canonicalize so realpath comparisons agree on hosts where the working
  // directory itself sits behind a symlink (/var -> /private/var on macOS).
  root = realpathSync(resolve(root));
  const violations = [];
  const report = (invariant, config, detail) =>
    violations.push({ invariant, config, detail });

  const outputRoot = resolve(root, OUTPUT_DIR);
  try {
    if (!lstatSync(outputRoot).isDirectory()) {
      report('output-shape', null, `${OUTPUT_DIR} must be a real directory`);
      return { violations, configs: 0, references: 0 };
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      report('output-shape', null, `${OUTPUT_DIR} missing under ${root}`);
      return { violations, configs: 0, references: 0 };
    }
    throw error;
  }

  let ignore = null;
  try {
    ignore = compileIgnore(
      readFileSync(resolve(root, '.vercelignore'), 'utf8')
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const configPaths = collectFunctionConfigs(outputRoot, violations);
  const parsed = [];
  const directoryLinks = []; // { config, key, target } across all functions
  let references = 0;
  for (const path of configPaths) {
    const configRel = toPosix(relative(root, path));
    let config;
    try {
      config = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      report('vc-config-parse', configRel, 'unparseable .vc-config.json');
      continue;
    }
    const map = config?.filePathMap;
    if (!map || typeof map !== 'object' || Array.isArray(map)) continue;
    parsed.push({ configRel, map });
  }

  for (const { configRel, map } of parsed) {
    const linkedKeys = new Set();
    for (const [key, rawValue] of Object.entries(map)) {
      references += 1;
      const value = String(rawValue);
      if (!within(root, resolve(root, key))) {
        report(
          'path-escape',
          configRel,
          `key ${q(key)} resolves outside the archive root`
        );
      }
      const traced = resolve(root, value);
      if (!within(root, traced)) {
        report(
          'path-escape',
          configRel,
          `value ${q(value)} for key ${q(key)} resolves outside the archive root`
        );
        continue;
      }
      let stat;
      try {
        stat = lstatSync(traced);
      } catch (error) {
        if (error.code === 'ENOENT') {
          report(
            'traced-path-missing',
            configRel,
            `value ${q(value)} for key ${q(key)} does not exist`
          );
          continue;
        }
        throw error;
      }
      let linkIsDirectory = false;
      if (stat.isSymbolicLink()) {
        try {
          linkIsDirectory = statSync(traced).isDirectory();
        } catch {
          // Dangling links are reported as file-symlink violations below.
        }
      }
      const isDirectory = stat.isDirectory() || linkIsDirectory;
      if (
        ignore &&
        !value
          .split('/')
          .some(segment => segment === 'node_modules' || segment === '.next') &&
        ignore.ignores(value, isDirectory)
      ) {
        report(
          'vercelignore-dropped',
          configRel,
          `value ${q(value)} for key ${q(key)} is matched by .vercelignore and would be dropped by CLI >= 59`
        );
      }
      if (!stat.isSymbolicLink()) {
        if (stat.isFile()) {
          let real;
          try {
            real = realpathSync(traced);
          } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
          }
          if (!within(root, real)) {
            report(
              'path-escape',
              configRel,
              `value ${q(value)} for key ${q(key)} resolves through a link outside the archive root`
            );
          } else if (real !== traced) {
            report(
              'through-directory-link',
              configRel,
              `value ${q(value)} for key ${q(key)} resolves through a symlinked directory to ${q(toPosix(relative(root, real)))}`
            );
          }
        }
        continue;
      }
      let target;
      try {
        target = realpathSync(traced);
      } catch {
        report(
          'file-symlink',
          configRel,
          `value ${q(value)} for key ${q(key)} is a dangling symlink`
        );
        continue;
      }
      if (!within(root, target)) {
        report(
          'path-escape',
          configRel,
          `value ${q(value)} for key ${q(key)} links outside the archive root`
        );
        continue;
      }
      const targetRel = toPosix(relative(root, target));
      if (lstatSync(target).isDirectory()) {
        linkedKeys.add(key);
        directoryLinks.push({ configRel, map, key, target: targetRel });
        continue;
      }
      report(
        'file-symlink',
        configRel,
        `value ${q(value)} for key ${q(key)} is a symlink to ${q(targetRel)}`
      );
    }
    // A file key beneath a key that is itself a linked directory is written
    // through that link in the archive (#18755).
    for (const key of Object.keys(map)) {
      for (
        let at = key.lastIndexOf('/');
        at > 0;
        at = key.lastIndexOf('/', at - 1)
      ) {
        if (linkedKeys.has(key.slice(0, at))) {
          report(
            'key-under-linked-key',
            configRel,
            `file key ${q(key)} sits beneath linked directory key ${q(key.slice(0, at))}`
          );
          break;
        }
      }
    }
  }

  // The upload is .vercel/output plus the union of every filePathMap value
  // and each value's ancestor directories. A directory link whose real target
  // holds none of those paths arrives dangling (#18749).
  const uploaded = new Set();
  for (const { map } of parsed) {
    for (const value of Object.values(map)) {
      for (let path = String(value); path && !uploaded.has(path); ) {
        uploaded.add(path);
        path = path.slice(0, Math.max(path.lastIndexOf('/'), 0));
      }
    }
  }
  for (const { configRel, key, target } of directoryLinks) {
    if (!uploaded.has(target)) {
      report(
        'dangling-directory-link',
        configRel,
        `directory link key ${q(key)} targets ${q(target)}, which contributes no uploaded file`
      );
    }
  }

  return { violations, configs: parsed.length, references };
}

export function formatViolations({ violations, configs, references }) {
  const lines = violations.map(
    ({ invariant, config, detail }) =>
      `vercel-output-validate| ${invariant}: ${config ?? '(output)'} ${detail}`
  );
  if (lines.length === 0) {
    lines.push(
      `vercel-output-validate| clean: configs=${configs} references=${references}`
    );
  } else {
    lines.push(
      `vercel-output-validate| ${lines.length} violation(s) across ${configs} function config(s)`
    );
  }
  return lines.join('\n');
}

export function main(
  argv,
  { cwd = process.cwd(), log = console.log, err = console.error } = {}
) {
  const args = [...argv];
  const take = flag => {
    const index = args.indexOf(flag);
    if (index === -1) return undefined;
    const value = args[index + 1];
    if (value === undefined) throw new Error(`${flag} requires a value`);
    args.splice(index, 2);
    return value;
  };
  const root = resolve(cwd, take('--root') ?? '.');
  if (args.length > 0) throw new Error(`Unknown arguments: ${args.join(' ')}`);
  const result = validateVercelOutput({ root });
  const report = formatViolations(result);
  if (result.violations.length > 0) {
    err(report);
    return 1;
  }
  log(report);
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
    console.error(`vercel-output-validate: ${error.message}`);
    process.exitCode = 1;
  }
}
/* c8 ignore stop */
