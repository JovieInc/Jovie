import { describe, expect, it } from 'vitest';
import {
  COUNT_CONTRACT,
  convertQuantity,
  DURATION_MINUTES_CONTRACT,
  formatQuantity,
  normalizeQuantity,
  type QuantityContract,
  stepQuantity,
  USD_AMOUNT_CONTRACT,
} from './quantity';

describe('quantity presentation contract', () => {
  it('steps counts by the domain-native quantum of 1', () => {
    expect(stepQuantity(3, 1, COUNT_CONTRACT)).toBe(4);
    expect(stepQuantity(0, -1, COUNT_CONTRACT)).toBe(0);
  });

  it('never derives the step from storage precision', () => {
    // A count stored as 3.0 in a Double column still steps by 1.
    expect(stepQuantity(3.0, 1, COUNT_CONTRACT)).toBe(4);
    // A duration still uses its 5-minute quantum, not 0.01-style storage precision.
    expect(stepQuantity(30, 1, DURATION_MINUTES_CONTRACT)).toBe(35);
  });

  it('quantizes and clamps direct entry to the contract', () => {
    expect(normalizeQuantity(9.999, USD_AMOUNT_CONTRACT)).toBe(10);
    expect(normalizeQuantity(Number.NaN, USD_AMOUNT_CONTRACT)).toBeNull();
    const bounded: QuantityContract = {
      domain: 'test',
      unit: 'count',
      quantum: 1,
      precision: 0,
      min: 1,
      max: 10,
    };
    expect(normalizeQuantity(99, bounded)).toBe(10);
    expect(normalizeQuantity(0, bounded)).toBe(1);
  });

  it("converts units into the destination unit's native quantum", () => {
    const lb: QuantityContract = {
      domain: 'load',
      unit: 'lb',
      quantum: 5,
      precision: 1,
      min: 0,
    };
    const kg: QuantityContract = {
      domain: 'load',
      unit: 'kg',
      quantum: 2.5,
      precision: 1,
      min: 0,
    };
    // 100 lb → 45.3592 kg must snap to the kg-native 2.5 quantum → 45.
    expect(convertQuantity(100, 0.45359237, kg)).toBe(45);
    expect(stepQuantity(100, 1, lb)).toBe(105);
  });

  it('formats without floating-point artifacts', () => {
    expect(formatQuantity(0.1 + 0.2, USD_AMOUNT_CONTRACT)).toBe('$0.30');
    expect(formatQuantity(1000, COUNT_CONTRACT)).toBe('1,000');
  });
});
