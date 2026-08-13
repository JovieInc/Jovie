import { describe, expect, it } from 'vitest';

import {
  compareClientVersions,
  isClientUpgradeRequired,
} from './client-version';

describe('compareClientVersions', () => {
  it('orders dotted-numeric versions segment-wise', () => {
    expect(compareClientVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareClientVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareClientVersions('1.2.0', '1.2.0')).toBe(0);
  });

  it('treats omitted trailing segments as zero', () => {
    expect(compareClientVersions('1.2', '1.2.0')).toBe(0);
    expect(compareClientVersions('1.2', '1.2.1')).toBeLessThan(0);
  });

  it('sorts malformed versions below every well-formed version', () => {
    expect(compareClientVersions('dev-build', '0.0.1')).toBeLessThan(0);
    expect(compareClientVersions('1.2.x', '1.2.0')).toBeLessThan(0);
    expect(compareClientVersions('0.0.1', 'dev-build')).toBeGreaterThan(0);
    expect(compareClientVersions('dev-a', 'dev-b')).toBe(0);
  });
});

describe('isClientUpgradeRequired', () => {
  const action = {
    minimumClientVersions: { ios: '2.1.0', web: '1.0.0' },
  } as const;

  it('is false when the channel declares no minimum', () => {
    expect(isClientUpgradeRequired(action, 'cli', undefined)).toBe(false);
    expect(isClientUpgradeRequired({}, 'ios', undefined)).toBe(false);
  });

  it('is true when the client omits its version and a minimum is declared', () => {
    expect(isClientUpgradeRequired(action, 'ios', undefined)).toBe(true);
  });

  it('is true below the declared minimum', () => {
    expect(isClientUpgradeRequired(action, 'ios', '2.0.9')).toBe(true);
    expect(isClientUpgradeRequired(action, 'ios', '1.99.99')).toBe(true);
  });

  it('is false at the exact minimum boundary', () => {
    expect(isClientUpgradeRequired(action, 'ios', '2.1.0')).toBe(false);
    expect(isClientUpgradeRequired(action, 'ios', '2.1')).toBe(false);
  });

  it('is false above the declared minimum', () => {
    expect(isClientUpgradeRequired(action, 'ios', '2.1.1')).toBe(false);
    expect(isClientUpgradeRequired(action, 'ios', '3.0.0')).toBe(false);
  });

  it('fails closed on malformed versions', () => {
    expect(isClientUpgradeRequired(action, 'ios', 'not-a-version')).toBe(true);
    expect(isClientUpgradeRequired(action, 'ios', '2.1.x')).toBe(true);
  });
});
