import { basename } from 'node:path';
import {
  type CanonicalMusicalKey,
  createCanonicalMusicalKey,
  MUSICAL_KEY_MODES,
  MUSICAL_KEY_TONICS,
  type MusicalKeyMode,
  type MusicalKeyTonic,
} from '@jovie/audio-contracts';
import { z } from 'zod';

// Stryker disable all: Zod schemas are constructed during module loading,
// before Stryker activates an individual mutant. Invalid-message tests below
// still exercise every schema boundary without reporting false survivors.
const successSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('success'),
    camelot: z.string().regex(/^(?:[1-9]|1[0-2])[AB]$/),
    openkey: z.string().regex(/^(?:[1-9]|1[0-2])[dm]$/),
    key: z.string().min(3).max(128),
    class_id: z.number().int().min(0).max(23),
    filename: z.string().min(1).max(1024),
    generation: z.number().int().nonnegative(),
  })
  .strict();

const errorSchema = z
  .object({
    id: z.string().uuid(),
    status: z.literal('error'),
    error: z.string().min(1).max(4096),
    filename: z.string().min(1).max(1024),
    generation: z.number().int().nonnegative(),
  })
  .strict();
// Stryker restore all

const FLAT_TO_SHARP = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
} as const satisfies Readonly<Record<string, MusicalKeyTonic>>;

export class OpenKeyScanProtocolError extends Error {
  constructor(message = 'analyzer returned an invalid response') {
    super(message);
    this.name = 'OpenKeyScanProtocolError';
  }
}

export type OpenKeyScanProviderMessage =
  | {
      readonly status: 'success';
      readonly id: string;
      readonly filename: string;
      readonly generation: number;
      readonly classId: number;
      readonly key: CanonicalMusicalKey;
    }
  | {
      readonly status: 'error';
      readonly id: string;
      readonly filename: string;
      readonly generation: number;
    };

function keyFromCamelot(camelot: string): CanonicalMusicalKey | null {
  for (const mode of MUSICAL_KEY_MODES) {
    for (const tonic of MUSICAL_KEY_TONICS) {
      const key = createCanonicalMusicalKey(tonic, mode);
      if (key.camelot === camelot) return key;
    }
  }
  return null;
}

function normalizeTonic(value: string): MusicalKeyTonic | null {
  if ((MUSICAL_KEY_TONICS as readonly string[]).includes(value)) {
    return value as MusicalKeyTonic;
  }
  return FLAT_TO_SHARP[value as keyof typeof FLAT_TO_SHARP] ?? null;
}

function traditionalMatches(
  providerValue: string,
  expected: CanonicalMusicalKey
): boolean {
  return providerValue.split('/').every(variant => {
    const match = /^([A-G](?:#|b)?) (major|minor)$/.exec(variant.trim());
    if (!match) return false;
    return (
      normalizeTonic(match[1] as string) === expected.tonic &&
      (match[2] as MusicalKeyMode) === expected.mode
    );
  });
}

export function parseOpenKeyScanProviderMessage(
  value: unknown,
  audioPath: string
): OpenKeyScanProviderMessage {
  const success = successSchema.safeParse(value);
  if (success.success) {
    const key = keyFromCamelot(success.data.camelot);
    const expectedClassId =
      Number.parseInt(success.data.camelot, 10) -
      1 +
      (success.data.camelot.endsWith('B') ? 12 : 0);
    if (
      !key ||
      key.openKey !== success.data.openkey ||
      expectedClassId !== success.data.class_id ||
      success.data.filename !== basename(audioPath) ||
      !traditionalMatches(success.data.key, key)
    ) {
      throw new OpenKeyScanProtocolError(
        'analyzer returned inconsistent key metadata'
      );
    }
    return {
      status: 'success',
      id: success.data.id,
      filename: success.data.filename,
      generation: success.data.generation,
      classId: success.data.class_id,
      key,
    };
  }

  const failure = errorSchema.safeParse(value);
  if (failure.success && failure.data.filename === basename(audioPath)) {
    return {
      status: 'error',
      id: failure.data.id,
      filename: failure.data.filename,
      generation: failure.data.generation,
    };
  }
  throw new OpenKeyScanProtocolError();
}
