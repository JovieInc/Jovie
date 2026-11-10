import { describe, expect, it } from 'vitest';
import { compactEditableIsrc, normalizeEditableIsrc } from './editable-isrc';

describe('normalizeEditableIsrc', () => {
  it('clears blank input and compacts a dashed code', () => {
    expect(normalizeEditableIsrc(null)).toBeNull();
    expect(normalizeEditableIsrc(undefined)).toBeNull();
    expect(normalizeEditableIsrc('   ')).toBeNull();
    expect(normalizeEditableIsrc('us-rc17607839')).toBe('USRC17607839');
    expect(compactEditableIsrc(' us-rc1 7607840 ')).toBe('USRC17607840');
  });

  it('rejects a code that is not two letters, three letters or digits, then seven digits', () => {
    expect(() => normalizeEditableIsrc('---')).toThrow(
      'ISRC must be 12 letters and digits'
    );
    expect(() => normalizeEditableIsrc('NOPE')).toThrow(
      'ISRC must be 12 letters and digits'
    );
    expect(() => normalizeEditableIsrc('USRC1760783')).toThrow(
      'ISRC must be 12 letters and digits'
    );
  });
});
