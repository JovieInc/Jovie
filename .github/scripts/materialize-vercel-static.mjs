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
import { dirname, relative, resolve, sep } from 'node:path';
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
      const path = resolve(directory, name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isSymbolicLink()) {
        let target;
        try {
          target = realpathSync(path);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          const publicFile = resolve(
            root,
            'apps/web/public',
            relative(resolve(output, 'static'), path)
          );
          // Never repair an arbitrary dangling artifact from a similarly named
          // file. It must be the exact relocated canonical source symlink.
          if (
            !lstatSync(publicFile).isSymbolicLink() ||
            readlinkSync(publicFile) !== readlinkSync(path)
          ) {
            throw new Error(
              'Dangling static link does not match public export'
            );
          }
          target = realpathSync(publicFile);
        }
        inside(root, target);
        if (!lstatSync(target).isFile())
          throw new Error('Static symlink target must be a file');
        pending.push({ path, target });
      } else if (!stat.isFile()) {
        throw new Error('Unsupported static artifact entry');
      }
    }
  }
  walk(resolve(output, 'static'));
  // Validate the complete tree before replacing any link. Copy alongside the
  // destination and rename so an interrupted copy cannot expose partial bytes.
  for (const { path, target } of pending) {
    const temporary = resolve(
      dirname(path),
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
