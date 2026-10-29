import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// A restored node_modules tree is a starting point; `pnpm install
// --frozen-lockfile` is trusted to reconcile it. On 2026-10-26/27 trees saved
// under exact cache keys still linked better-sqlite3 to an unpatched
// prebuild-install, so every PR restoring one failed
// scripts/prebuild-install-dep0176.test.mjs until the entry was evicted. This
// check proves each patchedDependencies entry is what actually resolves, before
// the tree is used or saved.

function patchedFiles(patchText) {
  const files = new Map();
  let current = null;
  for (const line of patchText.split('\n')) {
    const header = /^diff --git a\/(.+) b\/.+$/.exec(line);
    if (header) {
      current = { file: header[1], additions: [] };
      files.set(current.file, current);
    } else if (current && line.startsWith('+') && !line.startsWith('+++')) {
      const text = line.slice(1).trimEnd();
      if (text.trim()) current.additions.push(text);
    }
  }
  return [...files.values()];
}

function splitSpec(spec) {
  const at = spec.lastIndexOf('@');
  return { name: spec.slice(0, at), version: spec.slice(at + 1) };
}

// Every real directory of `name` that some symlink in the virtual store
// points at: those are the copies a dependent can actually require.
function linkedInstances(root, name) {
  const store = join(root, 'node_modules/.pnpm');
  const instances = new Set();
  if (!existsSync(store)) return instances;
  const candidates = [
    join(root, 'node_modules', name),
    join(store, 'node_modules', name),
  ];
  for (const entry of readdirSync(store)) {
    candidates.push(join(store, entry, 'node_modules', name));
  }
  for (const candidate of candidates) {
    let stat;
    try {
      stat = lstatSync(candidate);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) instances.add(realpathSync(candidate));
  }
  return instances;
}

export function verifyPatchedDependencies(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const patched = manifest.pnpm?.patchedDependencies ?? {};
  const problems = [];
  for (const [spec, patchPath] of Object.entries(patched)) {
    const { name, version } = splitSpec(spec);
    const files = patchedFiles(readFileSync(join(root, patchPath), 'utf8'));
    const instances = [...linkedInstances(root, name)].filter(dir => {
      try {
        return (
          JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
            .version === version
        );
      } catch {
        return false;
      }
    });
    if (instances.length === 0) {
      problems.push(`${spec}: no linked install found`);
      continue;
    }
    for (const dir of instances) {
      for (const { file, additions } of files) {
        const target = join(dir, file);
        const source = existsSync(target) ? readFileSync(target, 'utf8') : '';
        const missing = additions.find(line => !source.includes(line));
        if (missing !== undefined) {
          problems.push(
            `${spec}: ${patchPath} is not applied in ${dir} (${file} lacks ${JSON.stringify(missing.trim())})`
          );
          break;
        }
      }
    }
  }
  return problems;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const problems = verifyPatchedDependencies(root);
  if (problems.length) {
    for (const problem of problems) {
      process.stderr.write(`patched-dependency-stale: ${problem}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write('patched dependencies verified\n');
  }
}
