import { describe, expect, it } from 'vitest';
import {
  assertCustomerVoiceFloor,
  CopyFloorViolationError,
  customerVoiceFloorViolations,
} from '@/lib/copy/outbound-floor';

describe('customerVoiceFloorViolations', () => {
  it('returns no violations for clean customer-voice copy', () => {
    expect(
      customerVoiceFloorViolations(
        'The new single is out now. Listen on the smart link.'
      )
    ).toEqual([]);
  });

  it('returns blocking rule ids for floor-breaking copy', () => {
    const violations = customerVoiceFloorViolations(
      'Act now and get guaranteed streams on every playlist.'
    );
    expect(violations).toContain('guaranteed-results');
    expect(violations).toContain('fake-scarcity');
  });

  it('treats blank text as clean', () => {
    expect(customerVoiceFloorViolations('   ')).toEqual([]);
  });
});

describe('assertCustomerVoiceFloor', () => {
  it('does not throw for clean copy', () => {
    expect(() =>
      assertCustomerVoiceFloor('New EP out Friday.', 'test')
    ).not.toThrow();
  });

  it('throws CopyFloorViolationError with surface and rules', () => {
    try {
      assertCustomerVoiceFloor(
        'We guarantee playlist placements.',
        'pitch:test'
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CopyFloorViolationError);
      const violation = error as CopyFloorViolationError;
      expect(violation.surface).toBe('pitch:test');
      expect(violation.rules).toContain('guaranteed-results');
      expect(violation.message).toContain('pitch:test');
    }
  });
});
