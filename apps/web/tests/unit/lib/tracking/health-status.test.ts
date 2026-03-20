/**
 * Tests for computeHealthStatus logic used by the pixel health endpoint.
 * Function is imported from the production module to prevent drift.
 */
import { describe, expect, it } from 'vitest';
import { computeHealthStatus } from '@/lib/tracking/track-helpers';

describe('computeHealthStatus', () => {
  it('returns inactive when no events exist', () => {
    expect(computeHealthStatus(0, 0, null)).toBe('inactive');
  });

  it('returns unhealthy when all events failed', () => {
    expect(computeHealthStatus(0, 10, null)).toBe('unhealthy');
  });

  it('returns unhealthy when lastSuccessAt is null but events exist', () => {
    expect(computeHealthStatus(5, 0, null)).toBe('unhealthy');
  });

  it('returns healthy when recent success and low failure rate', () => {
    const recentSuccess = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    expect(computeHealthStatus(100, 5, recentSuccess)).toBe('healthy');
  });

  it('returns degraded when failure rate >= 10% but success within 72h', () => {
    const recentSuccess = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
    expect(computeHealthStatus(50, 50, recentSuccess)).toBe('degraded');
  });

  it('returns degraded when no success in 24-72h window', () => {
    const oldSuccess = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
    expect(computeHealthStatus(100, 5, oldSuccess)).toBe('degraded');
  });

  it('returns unhealthy when last success > 72h ago', () => {
    const veryOldSuccess = new Date(Date.now() - 96 * 60 * 60 * 1000); // 96 hours ago
    expect(computeHealthStatus(100, 5, veryOldSuccess)).toBe('unhealthy');
  });

  it('returns healthy at exactly 9.9% failure rate with recent success', () => {
    const recentSuccess = new Date(Date.now() - 1 * 60 * 60 * 1000);
    // 99 sent, 10 failed = 9.17% — just under 10%
    expect(computeHealthStatus(99, 10, recentSuccess)).toBe('healthy');
  });

  it('returns degraded at exactly 10% failure rate with recent success', () => {
    const recentSuccess = new Date(Date.now() - 1 * 60 * 60 * 1000);
    // 90 sent, 10 failed = 10%
    expect(computeHealthStatus(90, 10, recentSuccess)).toBe('degraded');
  });
});
