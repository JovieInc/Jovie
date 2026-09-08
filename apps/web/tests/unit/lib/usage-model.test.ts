import { describe, expect, it } from 'vitest';
import { createUsageMeterModel } from '@/lib/usage/model';

describe('createUsageMeterModel', () => {
  it('creates a coherent remaining-capacity model with one warning threshold', () => {
    const model = createUsageMeterModel({
      used: 40,
      limit: 100,
      remaining: 60,
      resetAt: '2026-08-18T00:00:00.000Z',
    });

    expect(model).toMatchObject({
      used: 40,
      limit: 100,
      remaining: 60,
      remainingPercent: 60,
      state: 'healthy',
      resetAt: '2026-08-18T00:00:00.000Z',
    });
    expect(model?.warningRemainingPercent).toBe(20);
  });

  it('uses the lower remaining observation when upstream counts disagree', () => {
    expect(
      createUsageMeterModel({ used: 20, limit: 100, remaining: 15 })
    ).toMatchObject({ used: 85, remaining: 15, remainingPercent: 15 });

    expect(
      createUsageMeterModel({ used: 90, limit: 100, remaining: 80 })
    ).toMatchObject({ used: 90, remaining: 10, remainingPercent: 10 });
  });

  it('honors an exact product warning threshold without weakening the floor', () => {
    expect(
      createUsageMeterModel({
        used: 78,
        limit: 100,
        remaining: 22,
        warningRemaining: 30,
      })
    ).toMatchObject({ state: 'warning' });

    expect(
      createUsageMeterModel({
        used: 89,
        limit: 100,
        remaining: 11,
        warningRemaining: 5,
      })
    ).toMatchObject({ state: 'warning' });

    expect(
      createUsageMeterModel({
        used: 2,
        limit: 3,
        remaining: 1,
        warningRemaining: 1,
      })
    ).toMatchObject({
      remainingPercent: 33,
      warningRemainingPercent: 34,
      state: 'warning',
    });
  });

  it('classifies exact healthy, warning, and exhausted boundaries', () => {
    expect(createUsageMeterModel({ used: 79, limit: 100 })?.state).toBe(
      'healthy'
    );
    expect(createUsageMeterModel({ used: 80, limit: 100 })?.state).toBe(
      'warning'
    );
    expect(createUsageMeterModel({ used: 100, limit: 100 })?.state).toBe(
      'exhausted'
    );
  });

  it('fails closed for invalid or non-positive counters', () => {
    expect(createUsageMeterModel({ used: Number.NaN, limit: 100 })).toBeNull();
    expect(createUsageMeterModel({ used: -1, limit: 100 })).toBeNull();
    expect(createUsageMeterModel({ used: 0, limit: 0 })).toBeNull();
    expect(
      createUsageMeterModel({ used: 0, limit: 100, remaining: Infinity })
    ).toBeNull();
  });

  it('clears invalid reset timestamps instead of presenting them', () => {
    expect(
      createUsageMeterModel({ used: 1, limit: 10, resetAt: 'bad-date' })
        ?.resetAt
    ).toBeNull();
  });
});
