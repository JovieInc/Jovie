import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPERATOR_NAV_ITEMS } from '@/components/organisms/operator-navigation';
import { useSidebarPins } from './useSidebarPins';

describe('scoped authorized sidebar pins', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('persists insertion order and filters revoked or unknown IDs without granting a destination', () => {
    localStorage.setItem(
      'jovie:sidebar:pins:v1:u:ov',
      JSON.stringify(['unknown', 'ov_people', 'ov_people'])
    );
    const { result, rerender } = renderHook(
      ({ items }) => useSidebarPins('u:ov', items),
      { initialProps: { items: OPERATOR_NAV_ITEMS } }
    );
    expect(result.current.pinned.map(item => item.id)).toEqual(['ov_people']);
    act(() => result.current.toggle?.('ov_certifications'));
    expect(result.current.pinned.map(item => item.id)).toEqual([
      'ov_people',
      'ov_certifications',
    ]);
    act(() => result.current.toggle?.('denied'));
    rerender({
      items: OPERATOR_NAV_ITEMS.filter(item => item.id !== 'ov_people'),
    });
    expect(result.current.pinned.map(item => item.id)).toEqual([
      'ov_certifications',
    ]);
    expect(localStorage.getItem('jovie:sidebar:pins:v1:u:ov')).not.toContain(
      'denied'
    );
  });
  it('isolates account/workspace switches and tolerates corrupted or unavailable storage', () => {
    localStorage.setItem('jovie:sidebar:pins:v1:b:ov', '{broken');
    const { result, rerender } = renderHook(
      ({ scope }) => useSidebarPins(scope, OPERATOR_NAV_ITEMS),
      { initialProps: { scope: 'a:ov' } }
    );
    act(() => result.current.toggle?.('ov_people'));
    rerender({ scope: 'b:ov' });
    expect(result.current.pinned).toEqual([]);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    act(() => result.current.toggle?.('ov_certifications'));
    expect(result.current.pinned.map(item => item.id)).toEqual([
      'ov_certifications',
    ]);
    rerender({ scope: 'a:ov' });
    expect(result.current.pinned.map(item => item.id)).toEqual(['ov_people']);
  });
  it('has no persistence or mutation without an identified scope', () => {
    const { result } = renderHook(() =>
      useSidebarPins(undefined, OPERATOR_NAV_ITEMS)
    );
    expect(result.current.pinned).toEqual([]);
    expect(result.current.toggle).toBeUndefined();
  });
});
