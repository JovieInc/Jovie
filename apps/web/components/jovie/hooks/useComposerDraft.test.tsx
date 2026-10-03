import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createComposerDraft,
  useComposerDraft,
  useComposerDraftIntent,
} from './useComposerDraft';

describe('composer draft subscriptions', () => {
  it('keeps independent mounted drafts and applies functional edits synchronously', () => {
    const first = createComposerDraft('first');
    const second = createComposerDraft('second');
    const changed = vi.fn();
    const unsubscribe = first.subscribe(changed);
    first.set(value => `${value} edit`);
    first.set(value => `${value}!`);
    expect(first.getSnapshot()).toBe('first edit!');
    expect(second.getSnapshot()).toBe('second');
    expect(changed).toHaveBeenCalledTimes(2);
    first.set('first edit!');
    expect(changed).toHaveBeenCalledTimes(2);
    unsubscribe();
    first.set('after unmount');
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('updates the composer while the transcript intent subscriber stays idle', () => {
    const draft = createComposerDraft('');
    const ownerRenders = vi.fn();
    const composer = renderHook(() => useComposerDraft(draft));
    const owner = renderHook(
      ({ enabled }) => {
        ownerRenders();
        return useComposerDraftIntent(draft, enabled);
      },
      { initialProps: { enabled: false } }
    );
    const initialRenders = ownerRenders.mock.calls.length;
    for (const value of ['h', 'he', 'hello', 'hello world']) {
      act(() => draft.set(value));
      expect(composer.result.current).toBe(value);
    }
    expect(ownerRenders).toHaveBeenCalledTimes(initialRenders);
    owner.rerender({ enabled: true });
    expect(owner.result.current).toBe(true);
    const enabledRenders = ownerRenders.mock.calls.length;
    act(() => draft.set('still composing'));
    expect(ownerRenders).toHaveBeenCalledTimes(enabledRenders);
    act(() => draft.set('  '));
    expect(owner.result.current).toBe(false);
    expect(ownerRenders).toHaveBeenCalledTimes(enabledRenders + 1);
    act(() => draft.set('new intent'));
    expect(owner.result.current).toBe(true);
    expect(ownerRenders).toHaveBeenCalledTimes(enabledRenders + 2);
  });
});
