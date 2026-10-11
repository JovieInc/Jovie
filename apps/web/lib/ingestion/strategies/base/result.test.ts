import { describe, expect, it } from 'vitest';
import { createExtractionResult } from './result';

describe('createExtractionResult', () => {
  it('never stores a scraped page title as the display name (JOV-7753)', () => {
    expect(
      createExtractionResult([], 'therealeternia | Instagram, Facebook', null)
        .displayName
    ).toBe('therealeternia');
    expect(
      createExtractionResult([], 'Simple Things - Listen on Spotify', null)
        .displayName
    ).toBe('Simple Things');
    expect(createExtractionResult([], 'Jay-Z', null).displayName).toBe('Jay-Z');
    expect(createExtractionResult([], null, null).displayName).toBeNull();
  });
});
