import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  type CreatorProfileId,
  CreatorProfileIdSchema,
  type Isrc,
  isCreatorProfileId,
  isIsrc,
  isRecordingId,
  isReleaseId,
  isTrackId,
  isUpc,
  isUserId,
  parseIsrc,
  parseUpc,
  safeParseIsrc,
  safeParseUpc,
  type Upc,
  type UserId,
} from './branded';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('branded uuid schemas', () => {
  it('accepts a valid uuid and returns the unchanged string', () => {
    expect(CreatorProfileIdSchema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it('rejects malformed uuids', () => {
    expect(() => CreatorProfileIdSchema.parse('not-a-uuid')).toThrow();
    expect(() =>
      CreatorProfileIdSchema.parse('550e8400-e29b-41d4-a716-44665544000')
    ).toThrow();
    expect(() => CreatorProfileIdSchema.parse('')).toThrow();
  });

  it('rejects a uuid where a different brand is required (helpers)', () => {
    expect(isCreatorProfileId(VALID_UUID)).toBe(true);
    expect(isCreatorProfileId('nope')).toBe(false);
    expect(isUserId(VALID_UUID)).toBe(true);
    expect(isUserId('nope')).toBe(false);
    expect(isReleaseId(VALID_UUID)).toBe(true);
    expect(isTrackId(VALID_UUID)).toBe(true);
    expect(isRecordingId(VALID_UUID)).toBe(true);
  });
});

describe('Isrc', () => {
  it('normalizes lowercase input', () => {
    expect(parseIsrc('usabc1234567')).toBe('USABC1234567');
  });

  it('normalizes hyphenated input', () => {
    expect(parseIsrc('US-ABC-1234567')).toBe('USABC1234567');
  });

  it('preserves leading digits exactly (strings, never numbers)', () => {
    expect(parseIsrc('USABC0000001')).toBe('USABC0000001');
  });

  it('rejects malformed ISRCs', () => {
    expect(safeParseIsrc('USABC123456')).toBeNull(); // 11 chars
    expect(safeParseIsrc('USABC12345678')).toBeNull(); // 13 chars
    expect(safeParseIsrc('12ABC1234567')).toBeNull(); // country code not letters
    expect(safeParseIsrc('USABC123456A')).toBeNull(); // trailing designator
    expect(safeParseIsrc('')).toBeNull();
  });

  it('isIsrc guards on normalized+validated values', () => {
    expect(isIsrc('us-abc-1234567')).toBe(true);
    expect(isIsrc('USABC123456')).toBe(false);
  });
});

describe('Upc', () => {
  it('preserves leading zeros', () => {
    expect(parseUpc('036000291452')).toBe('036000291452');
  });

  it('normalizes hyphenated and spaced input', () => {
    expect(parseUpc(' 036-0002-9145-2 ')).toBe('036000291452');
    expect(safeParseUpc('4006381333931')).toBe('4006381333931'); // EAN-13
  });

  it('recovers a numeric-coerced UPC-A (dropped leading zero) via check digit', () => {
    expect(safeParseUpc('36000291452')).toBe('036000291452');
  });

  it('rejects failed check digits and malformed shapes', () => {
    expect(safeParseUpc('123456789013')).toBeNull(); // bad check digit
    expect(safeParseUpc('36000291453')).toBeNull(); // bad check digit after pad
    expect(safeParseUpc('1234')).toBeNull(); // too short
    expect(safeParseUpc('03600029145a')).toBeNull(); // non-digit
    expect(safeParseUpc('')).toBeNull();
  });

  it('isUpc guards on normalized+validated values', () => {
    expect(isUpc('036000291452')).toBe(true);
    expect(isUpc('123456789013')).toBe(false);
  });
});

// Type-level contract: brands are nominal. These compile only when the
// identities hold; at runtime they are no-ops.
expectTypeOf<UserId>().toExtend<string>();
expectTypeOf<CreatorProfileId>().toExtend<string>();
expectTypeOf<UserId>().not.toExtend<CreatorProfileId>();
expectTypeOf<CreatorProfileId>().not.toExtend<UserId>();
expectTypeOf<Isrc>().not.toExtend<Upc>();
expectTypeOf<ReturnType<typeof parseIsrc>>().toEqualTypeOf<Isrc>();
expectTypeOf<ReturnType<typeof parseUpc>>().toEqualTypeOf<Upc>();
