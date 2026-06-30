import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EntityRef } from '@/lib/commands/entities';
import {
  __resetEntityRecentsForTest,
  useEntityRecents,
} from './useEntityRecents';

const PROFILE = 'profile-1';

function artist(id: string): EntityRef {
  return {
    kind: 'artist',
    id,
    label: `Artist ${id}`,
    meta: { kind: 'artist', subtitle: 'Spotify artist' },
  };
}

beforeEach(() => {
  __resetEntityRecentsForTest();
  window.localStorage.clear();
});

describe('useEntityRecents', () => {
  it('starts empty and records most-recent-first', () => {
    const { result } = renderHook(() => useEntityRecents(PROFILE));
    expect(result.current.recents).toEqual([]);

    act(() => result.current.record(artist('a')));
    act(() => result.current.record(artist('b')));

    expect(result.current.recents.map(r => r.id)).toEqual(['b', 'a']);
  });

  it('de-dupes by kind:id and moves the re-tagged entity to the front', () => {
    const { result } = renderHook(() => useEntityRecents(PROFILE));
    act(() => result.current.record(artist('a')));
    act(() => result.current.record(artist('b')));
    act(() => result.current.record(artist('a')));

    expect(result.current.recents.map(r => r.id)).toEqual(['a', 'b']);
  });

  it('caps the list at 16 entries', () => {
    const { result } = renderHook(() => useEntityRecents(PROFILE));
    act(() => {
      for (let i = 0; i < 20; i++) result.current.record(artist(String(i)));
    });
    expect(result.current.recents).toHaveLength(16);
    // Newest kept, oldest evicted.
    expect(result.current.recents[0]?.id).toBe('19');
    expect(result.current.recents.some(r => r.id === '0')).toBe(false);
  });

  it('persists to localStorage and rehydrates a fresh store', () => {
    const first = renderHook(() => useEntityRecents(PROFILE));
    act(() => first.result.current.record(artist('a')));

    // Simulate a fresh page load: drop the in-memory cache, keep localStorage.
    __resetEntityRecentsForTest();
    const second = renderHook(() => useEntityRecents(PROFILE));
    expect(second.result.current.recents.map(r => r.id)).toEqual(['a']);
  });

  it('keeps profiles isolated', () => {
    const a = renderHook(() => useEntityRecents('profile-a'));
    const b = renderHook(() => useEntityRecents('profile-b'));
    act(() => a.result.current.record(artist('x')));
    expect(a.result.current.recents.map(r => r.id)).toEqual(['x']);
    expect(b.result.current.recents).toEqual([]);
  });

  it('ignores an empty profile id', () => {
    const { result } = renderHook(() => useEntityRecents(''));
    act(() => result.current.record(artist('a')));
    expect(result.current.recents).toEqual([]);
  });

  it('syncs a record across separate hook instances of the same profile', () => {
    const a = renderHook(() => useEntityRecents(PROFILE));
    const b = renderHook(() => useEntityRecents(PROFILE));
    act(() => a.result.current.record(artist('x')));
    expect(b.result.current.recents.map(r => r.id)).toEqual(['x']);
  });

  it('falls back to empty when localStorage holds corrupt data', () => {
    window.localStorage.setItem(
      'jovie:entity-recents:v1:profile-corrupt',
      '{not json'
    );
    const { result } = renderHook(() => useEntityRecents('profile-corrupt'));
    expect(result.current.recents).toEqual([]);
  });
});
