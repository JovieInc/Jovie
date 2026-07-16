import { randomUUID } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/**
 * Produces a replacement in a unique sibling, then atomically renames it over
 * the stable file only after the producer confirms the replacement. Temporary
 * siblings are removed after unchanged, failed, or interrupted attempts.
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
    if (!shouldReplace) return false;

    await rename(temporaryPath, targetPath);
    return true;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
