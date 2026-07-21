import { describe, expect, it } from 'vitest';
import {
  buildNumberedHandleSuggestions,
  isContradictoryHandleStatus,
  SUGGESTED_AVAILABLE_HANDLE_LABEL,
  toHandleAvailabilityResult,
} from './handle-availability';

describe('toHandleAvailabilityResult', () => {
  it('returns a single available status without suggested alternatives', () => {
    const result = toHandleAvailabilityResult({
      handle: '@DavidGuetta',
      available: true,
      suggestedAlternatives: ['davidguetta1'],
    });

    expect(result).toEqual({
      handle: 'davidguetta',
      available: true,
      reason: 'available',
    });
    expect(result.suggestedAlternatives).toBeUndefined();
  });

  it('never reports available while checking', () => {
    const result = toHandleAvailabilityResult({
      handle: 'takenhandle',
      available: true,
      checking: true,
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe('checking');
  });

  it('surfaces numbered alternatives when taken — never silent swap', () => {
    const result = toHandleAvailabilityResult({
      handle: 'calvin',
      available: false,
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe('taken');
    expect(result.handle).toBe('calvin');
    expect(result.suggestedAlternatives).toEqual([
      'calvin1',
      'calvin2',
      'calvin3',
    ]);
    // Primary handle stays the requested one
    expect(result.handle).not.toBe(result.suggestedAlternatives?.[0]);
    expect(SUGGESTED_AVAILABLE_HANDLE_LABEL).toBe('Suggested available handle');
  });

  it('marks invalid format as unavailable (not available+taken dual state)', () => {
    const result = toHandleAvailabilityResult({
      handle: 'ab',
      available: true,
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe('invalid_format');
  });

  it('marks reserved handles as unavailable with alternatives', () => {
    const result = toHandleAvailabilityResult({
      handle: 'admin',
      available: true,
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe('reserved');
    expect(result.suggestedAlternatives?.length).toBeGreaterThan(0);
  });

  it('treats null availability as unknown (not available)', () => {
    const result = toHandleAvailabilityResult({
      handle: 'maybe',
      available: null,
    });

    expect(result.available).toBe(false);
    expect(result.reason).toBe('unknown');
  });
});

describe('buildNumberedHandleSuggestions', () => {
  it('skips taken candidates when a taken set is provided', () => {
    const suggestions = buildNumberedHandleSuggestions('artist', {
      limit: 2,
      taken: new Set(['artist1']),
    });

    expect(suggestions).toEqual(['artist2', 'artist3']);
  });
});

describe('isContradictoryHandleStatus', () => {
  it('detects available vs taken for the same handle', () => {
    const a = toHandleAvailabilityResult({
      handle: 'same',
      available: true,
    });
    const b = toHandleAvailabilityResult({
      handle: 'same',
      available: false,
    });

    expect(isContradictoryHandleStatus(a, b)).toBe(true);
    expect(isContradictoryHandleStatus(a, a)).toBe(false);
  });
});
