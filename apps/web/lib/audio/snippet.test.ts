import { describe, expect, it } from 'vitest';
import {
  createDefaultSnippet,
  normalizeSnippet,
  parseAudioSnippet,
} from './snippet';

describe('audio snippet helpers', () => {
  it('parses stored snippet metadata', () => {
    expect(
      parseAudioSnippet({
        audioSnippet: {
          startMs: 12_000,
          endMs: 42_000,
          updatedAt: '2026-06-09',
        },
      })
    ).toEqual({
      startMs: 12_000,
      endMs: 42_000,
      updatedAt: '2026-06-09',
    });
  });

  it('creates a centered default snippet', () => {
    expect(createDefaultSnippet(120_000)).toEqual({
      startMs: 45_000,
      endMs: 75_000,
    });
  });

  it('normalizes invalid trim ranges', () => {
    expect(
      normalizeSnippet({ startMs: 80_000, endMs: 10_000 }, 120_000)
    ).toEqual({
      startMs: 80_000,
      endMs: 81_000,
    });
  });
});
