import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PLATFORM_LIMITS } from '@/lib/services/pitch/types';

// Test the Zod output schema independently (same schema used in pitch-generator)
const pitchResponseSchema = z.object({
  spotify: z.string().max(PLATFORM_LIMITS.spotify),
  appleMusic: z.string().max(PLATFORM_LIMITS.appleMusic),
  amazon: z.string().max(PLATFORM_LIMITS.amazon),
  generic: z.string().max(PLATFORM_LIMITS.generic),
});

describe('pitch response schema', () => {
  it('accepts valid pitch response', () => {
    const valid = {
      spotify: 'A great new single from an emerging artist.',
      appleMusic: 'New release worth checking out.',
      amazon: 'Discover this new track from an independent artist.',
      generic: 'A longer pitch with more detail about the release.',
    };
    const result = pitchResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects spotify pitch exceeding 500 chars', () => {
    const invalid = {
      spotify: 'a'.repeat(501),
      appleMusic: 'ok',
      amazon: 'ok',
      generic: 'ok',
    };
    const result = pitchResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects apple music pitch exceeding 300 chars', () => {
    const invalid = {
      spotify: 'ok',
      appleMusic: 'a'.repeat(301),
      amazon: 'ok',
      generic: 'ok',
    };
    const result = pitchResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects amazon pitch exceeding 500 chars', () => {
    const invalid = {
      spotify: 'ok',
      appleMusic: 'ok',
      amazon: 'a'.repeat(501),
      generic: 'ok',
    };
    const result = pitchResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects generic pitch exceeding 1000 chars', () => {
    const invalid = {
      spotify: 'ok',
      appleMusic: 'ok',
      amazon: 'ok',
      generic: 'a'.repeat(1001),
    };
    const result = pitchResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const invalid = { spotify: 'ok' };
    const result = pitchResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts pitches at exact character limits', () => {
    const atLimit = {
      spotify: 'a'.repeat(500),
      appleMusic: 'a'.repeat(300),
      amazon: 'a'.repeat(500),
      generic: 'a'.repeat(1000),
    };
    const result = pitchResponseSchema.safeParse(atLimit);
    expect(result.success).toBe(true);
  });
});
