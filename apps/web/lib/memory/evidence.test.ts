import { describe, expect, it } from 'vitest';
import { mergeMetadata } from './evidence';

describe('mergeMetadata', () => {
  it('keeps the next object when the current bag is missing', () => {
    expect(mergeMetadata(null, { source: 'release' })).toEqual({
      source: 'release',
    });
    expect(mergeMetadata(undefined, { source: 'release' })).toEqual({
      source: 'release',
    });
  });

  it('overlays next fields on the current bag', () => {
    expect(
      mergeMetadata({ source: 'old', keep: true }, { source: 'release' })
    ).toEqual({
      source: 'release',
      keep: true,
    });
  });
});
