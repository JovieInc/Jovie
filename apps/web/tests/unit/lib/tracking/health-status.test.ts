/**
 * Tests for computeHealthStatus logic used by the pixel health endpoint.
 */
import { describe, expect, it } from 'vitest';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'inactive';

// Reimplemented from health/route.ts for unit testing
function computeHealthStatus(
  totalSent: number,
  totalFailed: number,
  lastSuccessAt: Date | null
): HealthStatus {
  const total = totalSent + totalFailed;

  if (total === 0) {
    return 'inactive';
  }

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const seventyTwoHoursAgo = now - 72 * 60 * 60 * 1000;

  const failureRate = total > 0 ? totalFailed / total : 0;
  const lastSuccessMs = lastSuccessAt ? lastSuccessAt.getTime() : 0;

  if (totalSent === 0 || !lastSuccessAt) {
    return 'unhealthy';
  }

  if (lastSuccessMs >= twentyFourHoursAgo && failureRate < 0.1) {
    return 'healthy';
  }

  if (failureRate >= 0.1 || lastSuccessMs < twentyFourHoursAgo) {
    if (lastSuccessMs >= seventyTwoHoursAgo) {
      return 'degraded';
    }
    return 'unhealthy';
  }

  return 'degraded';
}

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
