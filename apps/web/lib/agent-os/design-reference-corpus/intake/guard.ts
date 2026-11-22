import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_MAX_COPY_DISTANCE, findRefCopies } from '../perceptual-hash';
import type { DesignReferenceCorpus } from '../types';

/**
 * Ensures a newly captured fold is inspiration-grade, not a near pixel-copy of
 * an existing corpus reference (anti-copy guard on intake).
 */
export async function assertIntakeCapturePassesAntiCopyGuard(input: {
  jpeg: Buffer;
  corpus: DesignReferenceCorpus;
  excludeReferenceIds?: readonly string[];
}): Promise<void> {
  const exclude = new Set(input.excludeReferenceIds ?? []);
  const references = Object.values(input.corpus.references).filter(
    record => !exclude.has(record.reference.id)
  );
  const dir = await mkdtemp(join(tmpdir(), 'design-refs-intake-guard-'));
  const imagePath = join(dir, 'candidate.jpg');
  await writeFile(imagePath, input.jpeg);
  const matches = await findRefCopies({
    images: [imagePath],
    references,
    maxDistance: DEFAULT_MAX_COPY_DISTANCE,
  });
  if (matches.length > 0) {
    const match = matches[0];
    throw new Error(
      `anti-copy guard: intake capture is ${match.distance} bits from ${match.referenceId}`
    );
  }
}
