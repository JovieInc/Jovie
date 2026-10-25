import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  LAST_LOOKED_KEY,
  type LookedSnapshot,
} from '@/lib/ovie/home/since-last-looked';
import { useOvieLastLooked } from './useOvieLastLooked';

const T0 = Date.parse('2026-10-25T00:00:00Z');
const snap = (
  at: number,
  extra: Partial<LookedSnapshot> = {}
): LookedSnapshot => ({
  at,
  mrrUsd: 0,
  subscribers: 0,
  signups7d: 1,
  merges7d: 300,
  fleet: 'healthy',
  askIds: ['a'],
  ...extra,
});

describe('useOvieLastLooked', () => {
  beforeEach(() => globalThis.localStorage.clear());

  it('says nothing on a first visit and remembers the look', () => {
    const { result } = renderHook(() => useOvieLastLooked(snap(T0)));
    expect(result.current).toBeNull();
    expect(
      JSON.parse(globalThis.localStorage.getItem(LAST_LOOKED_KEY) ?? '{}').at
    ).toBe(T0);
  });

  it('compares a new visit with the previous look', () => {
    globalThis.localStorage.setItem(LAST_LOOKED_KEY, JSON.stringify(snap(T0)));
    const later = snap(T0 + 3 * 3_600_000, { signups7d: 4, fleet: 'degraded' });
    const { result } = renderHook(() => useOvieLastLooked(later));
    expect(result.current).toEqual({
      ageLabel: '3h ago',
      lines: ['+3 signups (7d)', 'Fleet healthy to degraded'],
    });
  });

  it('keeps the earlier baseline across a quick reload', () => {
    globalThis.localStorage.setItem(LAST_LOOKED_KEY, JSON.stringify(snap(T0)));
    const first = renderHook(() =>
      useOvieLastLooked(snap(T0 + 3_600_000, { signups7d: 5 }))
    );
    expect(first.result.current?.lines).toEqual(['+4 signups (7d)']);
    first.unmount();
    const reload = renderHook(() =>
      useOvieLastLooked(snap(T0 + 3_600_000 + 60_000, { signups7d: 5 }))
    );
    expect(reload.result.current?.lines).toEqual(['+4 signups (7d)']);
  });

  it('writes nothing until the sources have loaded', () => {
    renderHook(() => useOvieLastLooked(null));
    expect(globalThis.localStorage.getItem(LAST_LOOKED_KEY)).toBeNull();
  });

  it('survives unavailable storage', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(() => renderHook(() => useOvieLastLooked(snap(T0)))).not.toThrow();
    } finally {
      Storage.prototype.getItem = original;
    }
    act(() => undefined);
  });
});
