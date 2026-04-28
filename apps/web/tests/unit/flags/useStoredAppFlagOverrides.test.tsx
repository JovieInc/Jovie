import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStoredAppFlagOverrides } from '@/lib/flags/client';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import { FF_OVERRIDES_KEY } from '@/lib/flags/overrides';

const VALID_KEY_A = APP_FLAG_OVERRIDE_KEYS.SHELL_CHAT_V1;
const VALID_KEY_B = APP_FLAG_OVERRIDE_KEYS.PROFILE_V2;
const ORPHAN_KEY = 'code:RENAMED_OR_REMOVED_FLAG';

function seed(record: Record<string, boolean>) {
  localStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(record));
}

function readStorage(): Record<string, boolean> {
  return JSON.parse(localStorage.getItem(FF_OVERRIDES_KEY) ?? '{}');
}

describe('useStoredAppFlagOverrides — orphan handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('partitions valid overrides from orphan keys', () => {
    seed({ [VALID_KEY_A]: true, [ORPHAN_KEY]: false });

    const { result } = renderHook(() => useStoredAppFlagOverrides());

    expect(result.current.validOverrides).toEqual({ [VALID_KEY_A]: true });
    expect(result.current.orphanKeys).toEqual([ORPHAN_KEY]);
  });

  it('returns empty orphans when all keys are in the contract', () => {
    seed({ [VALID_KEY_A]: true, [VALID_KEY_B]: false });

    const { result } = renderHook(() => useStoredAppFlagOverrides());

    expect(result.current.orphanKeys).toEqual([]);
    expect(result.current.validOverrides).toEqual({
      [VALID_KEY_A]: true,
      [VALID_KEY_B]: false,
    });
  });

  it('purgeOrphans removes orphan keys and leaves valid overrides intact', () => {
    seed({ [VALID_KEY_A]: true, [ORPHAN_KEY]: false });

    const { result } = renderHook(() => useStoredAppFlagOverrides());

    act(() => {
      result.current.purgeOrphans();
    });

    expect(result.current.orphanKeys).toEqual([]);
    expect(result.current.validOverrides).toEqual({ [VALID_KEY_A]: true });
    expect(readStorage()).toEqual({ [VALID_KEY_A]: true });
  });

  it('purgeOrphans is idempotent — second call does not write again', () => {
    seed({ [VALID_KEY_A]: true, [ORPHAN_KEY]: false });

    const { result } = renderHook(() => useStoredAppFlagOverrides());

    act(() => {
      result.current.purgeOrphans();
    });

    const afterFirst = readStorage();

    act(() => {
      result.current.purgeOrphans();
    });

    expect(readStorage()).toEqual(afterFirst);
  });

  it('purgeOrphans is a no-op when there are no orphans', () => {
    seed({ [VALID_KEY_A]: true });

    const { result } = renderHook(() => useStoredAppFlagOverrides());
    const before = readStorage();

    act(() => {
      result.current.purgeOrphans();
    });

    expect(readStorage()).toEqual(before);
    expect(result.current.orphanKeys).toEqual([]);
  });

  it('responds to cross-tab storage events without auto-writing', () => {
    seed({ [VALID_KEY_A]: true });
    const { result } = renderHook(() => useStoredAppFlagOverrides());

    expect(result.current.orphanKeys).toEqual([]);

    act(() => {
      seed({ [VALID_KEY_A]: true, [ORPHAN_KEY]: false });
      globalThis.dispatchEvent(new Event('storage'));
    });

    expect(result.current.orphanKeys).toEqual([ORPHAN_KEY]);
    expect(readStorage()).toEqual({ [VALID_KEY_A]: true, [ORPHAN_KEY]: false });
  });
});
