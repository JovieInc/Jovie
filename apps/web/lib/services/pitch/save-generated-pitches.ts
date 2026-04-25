import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { buildPitchInput, generatePitches } from './index';

export class ReleasePitchGenerationError extends Error {
  readonly code: 'RELEASE_NOT_FOUND';

  constructor(code: ReleasePitchGenerationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export async function generateAndSaveReleasePitches(params: {
  readonly profileId: string;
  readonly releaseId: string;
  readonly instructions?: string;
}) {
  const pitchInput = await buildPitchInput(
    params.profileId,
    params.releaseId
  ).catch(() => null);

  if (!pitchInput) {
    throw new ReleasePitchGenerationError(
      'RELEASE_NOT_FOUND',
      'Release not found'
    );
  }

  const result = await generatePitches(pitchInput, params.instructions);

  await db
    .update(discogReleases)
    .set({ generatedPitches: result.pitches })
    .where(eq(discogReleases.id, params.releaseId));

  return result;
}
