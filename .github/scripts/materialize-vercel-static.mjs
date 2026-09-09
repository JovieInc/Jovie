import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
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
          : ['apps/web/public', 'apps/web/.next', '.vercel/output/static'];
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

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(
    `Materialized ${materializeStatic(process.cwd())} Vercel static symlinks.`
  );
}
