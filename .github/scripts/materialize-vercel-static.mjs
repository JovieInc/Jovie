import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function inside(root, path) {
  const name = relative(root, path);
  if (name === '..' || name.startsWith(`..${sep}`)) {
    throw new Error('Static asset target escapes repository');
  }
}

// Vercel relocates public symlinks without their relative targets. Resolve those
// links through the canonical public export, then seal bytes in the artifact.
// Source links remain intact; provenance captures the resulting immutable files.
export function materializeStatic(root) {
  root = realpathSync(root);
  const output = resolve(root, '.vercel/output');
  for (const path of [
    resolve(root, '.vercel'),
    output,
    resolve(output, 'static'),
  ]) {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
      throw new Error('Static artifact root must be a real directory');
    }
  }
  const pending = [];
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      if (name.startsWith('.jovie-materialize-')) {
        throw new Error('Unexpected temporary materializer entry in output');
      }
      const path = resolve(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isSymbolicLink()) {
        const publicFile = resolve(
          root,
          'apps/web/public',
          relative(resolve(output, 'static'), path)
        );
        let publicStat;
        try {
          publicStat = lstatSync(publicFile);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        let target;
        if (publicStat?.isSymbolicLink()) {
          // The source export is authoritative even if its relocated relative
          // link happens to resolve to different bytes in the output namespace.
          target = realpathSync(publicFile);
          if (
            readlinkSync(publicFile) !== readlinkSync(path) &&
            realpathSync(path) !== target
          ) {
            throw new Error('Static link does not match public export');
          }
        } else {
          // Arbitrary missing targets are never repaired by filename alone.
          target = realpathSync(path);
        }
        inside(root, target);
        const allowedRoots = publicStat?.isSymbolicLink()
          ? ['apps/web/public', 'apps/web/screenshot-catalog/current']
          : [
              'apps/web/public',
              'apps/web/.next/static',
              '.vercel/output/static',
            ];
        if (
          !allowedRoots.some(name =>
            target.startsWith(`${resolve(root, name)}${sep}`)
          )
        ) {
          throw new Error('Static target is outside an approved asset root');
        }
        if (!lstatSync(target).isFile())
          throw new Error('Static symlink target must be a file');
        pending.push({ path, target });
      } else if (!stat.isFile()) {
        throw new Error('Unsupported static artifact entry');
      }
    }
  }
  walk(resolve(output, 'static'));
  // Validate the complete tree before replacing any link. Stage outside output
  // on the build filesystem, then rename. SIGKILL can leave a partial staging
  // file, but it cannot become a deployable asset on a subsequent invocation.
  for (const { path, target } of pending) {
    const temporary = resolve(
      root,
      '.vercel',
      `.jovie-materialize-${randomUUID()}`
    );
    let copied = false;
    try {
      copyFileSync(target, temporary, 1); // COPYFILE_EXCL
      copied = true;
      renameSync(temporary, path);
    } finally {
      try {
        if (copied) unlinkSync(temporary);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  return pending.length;
}

// Next adds every file an outputFileTracingIncludes glob matches to the route
// trace as-is, so a symlinked source file (apps/web/public/product-screenshots
// links into screenshot-catalog/current) becomes a function filePathMap target
// that is itself a symlink. The prebuilt tgz archive then carries symlink
// entries Vercel's remote build cannot extract ("Extracting deployment
// files... Error: Unexpected error"), which blocked every staging deploy after
// those includes landed (JOV-6576). Point each such key at the link's real
// file: the function reads identical bytes at the same path, and the archive
// holds a regular file. Directory links (pnpm's node_modules layer) stay as
// traced, but files traced through one are re-pointed at their real path.
export function dereferenceFunctionFileLinks(root) {
  root = realpathSync(root);
  const functions = resolve(root, '.vercel/output/functions');
  let functionsStat;
  try {
    functionsStat = lstatSync(functions);
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  if (!functionsStat.isDirectory()) {
    throw new Error('Function artifact root must be a real directory');
  }
  const rewrites = [];
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const stat = lstatSync(path);
      // Linked .func directories alias a sibling walked on its own.
      if (stat.isDirectory()) walk(path);
      if (name !== '.vc-config.json' || !stat.isFile()) continue;
      const config = JSON.parse(readFileSync(path, 'utf8'));
      const map = config.filePathMap;
      if (!map || typeof map !== 'object') continue;
      let changed = 0;
      for (const [key, value] of Object.entries(map)) {
        const traced = resolve(root, String(value));
        inside(root, traced);
        let tracedStat;
        try {
          tracedStat = lstatSync(traced);
        } catch (error) {
          if (error.code === 'ENOENT') continue; // Not a link; CLI reports it.
          throw error;
        }
        if (!tracedStat.isSymbolicLink()) {
          // A regular file reached THROUGH a symlinked directory (pnpm's hoisted
          // .pnpm/node_modules layer, e.g. import-in-the-middle since Sentry
          // 10.75.3): the archive would hold the directory link and a file entry
          // beneath it, and Vercel rejects that path at "Extracting deployment
          // files" ("... is not a valid path"). Upload the real file instead.
          if (tracedStat.isFile()) {
            const real = realpathSync(traced);
            if (real !== traced) {
              inside(root, real);
              map[key] = relative(root, real).split(sep).join('/');
              changed += 1;
            }
          }
          continue;
        }
        let target;
        try {
          target = realpathSync(traced);
        } catch {
          throw new Error(`Function trace link is dangling: ${value}`);
        }
        inside(root, target);
        const targetStat = lstatSync(target);
        if (targetStat.isDirectory()) continue;
        if (!targetStat.isFile()) {
          throw new Error(`Function trace link target is not a file: ${value}`);
        }
        map[key] = relative(root, target).split(sep).join('/');
        changed += 1;
      }
      if (changed > 0) rewrites.push({ path, config, changed });
    }
  }
  walk(functions);
  // Validate every config before rewriting any of them.
  let total = 0;
  for (const { path, config, changed } of rewrites) {
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
    total += changed;
  }
  return total;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    `Materialized ${materializeStatic(process.cwd())} Vercel static symlinks.`
  );
  console.log(
    `Dereferenced ${dereferenceFunctionFileLinks(process.cwd())} function trace file symlinks.`
  );
}
