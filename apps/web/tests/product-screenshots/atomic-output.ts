import { randomUUID } from 'node:crypto';
import { lstat, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Produces a replacement in a unique sibling, then atomically renames it over
 * the stable file only after the producer confirms the replacement. Temporary
 * siblings are removed after unchanged, failed, or interrupted attempts.
 *
 * A symlinked target is always replaced with a regular file, even when the
 * content is unchanged: writing through the link would overwrite the file it
 * points at (another scenario's image), and the public export refuses a
 * symlinked catalog source.
 */
export async function replaceWithAtomicSibling(
  targetPath: string,
  produceReplacement: (temporaryPath: string) => Promise<boolean>
): Promise<boolean> {
  const temporaryPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}-${randomUUID()}.tmp`
  );

  try {
    const shouldReplace = await produceReplacement(temporaryPath);
    if (!shouldReplace && !(await isSymbolicLink(targetPath))) return false;

    await rename(temporaryPath, targetPath);
    return true;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function isSymbolicLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch {
    return false;
  }
}
