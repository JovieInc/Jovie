import { describe, expect, it } from 'vitest';
import {
  DELTA_TEXT_CLASS,
  deltaSentiment,
  directionOf,
  directionOfLabel,
  parsePolarity,
} from './metric-tone';

describe('metric tone (ASR-041)', () => {
  it('reads direction from numbers and formatted labels', () => {
    expect(directionOf(3)).toBe('up');
    expect(directionOf(-0.5)).toBe('down');
    expect(directionOf(0)).toBe('flat');
    expect(directionOf(Number.NaN)).toBe('flat');
    expect(directionOfLabel('+3')).toBe('up');
    expect(directionOfLabel('-16')).toBe('down');
    expect(directionOfLabel('−2.1%')).toBe('down');
    expect(directionOfLabel('0%')).toBe('flat');
    expect(directionOfLabel('flat')).toBe('flat');
    expect(directionOfLabel('alive')).toBeNull();
  });

  it('colors by sentiment: direction combined with polarity', () => {
    expect(deltaSentiment('up', 'higher-is-better')).toBe('positive');
    expect(deltaSentiment('down', 'higher-is-better')).toBe('negative');
    expect(deltaSentiment('down', 'lower-is-better')).toBe('positive');
    expect(deltaSentiment('up', 'lower-is-better')).toBe('negative');
    expect(deltaSentiment('up', 'neutral')).toBe('neutral');
    expect(deltaSentiment('flat', 'higher-is-better')).toBe('neutral');
  });

  it('defaults unknown polarity to higher-is-better', () => {
    expect(parsePolarity(undefined)).toBe('higher-is-better');
    expect(parsePolarity('lower-is-better')).toBe('lower-is-better');
    expect(parsePolarity(false)).toBe('lower-is-better');
    expect(parsePolarity('neutral')).toBe('neutral');
  });

  it('uses the contrast-safe -text tokens, never the neon fills', () => {
    expect(DELTA_TEXT_CLASS.positive).toBe('text-success-text');
    expect(DELTA_TEXT_CLASS.negative).toBe('text-error-text');
  });
});
