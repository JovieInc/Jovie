import { describe, expect, it, vi } from 'vitest';
import {
  insertLargeTextAtCaret,
  LARGE_PASTE_CHUNK_SIZE,
  shouldChunkLargePaste,
} from '@/lib/chat/large-text-paste';

describe('large-text-paste', () => {
  it('only chunks pastes at or above the threshold', () => {
    expect(shouldChunkLargePaste(4095)).toBe(false);
    expect(shouldChunkLargePaste(4096)).toBe(true);
  });

  it('inserts large pasted text in multiple onValueChange calls', () => {
    const pastedText = 'x'.repeat(LARGE_PASTE_CHUNK_SIZE * 2 + 10);
    const textarea = document.createElement('textarea');
    textarea.value = 'prefix|suffix';
    textarea.selectionStart = 6;
    textarea.selectionEnd = 6;

    const onValueChange = vi.fn();
    const schedule = vi.fn((work: () => void) => work());

    insertLargeTextAtCaret({
      textarea,
      pastedText,
      currentValue: 'prefix|suffix',
      onValueChange,
      schedule,
    });

    expect(onValueChange).toHaveBeenCalledTimes(3);
    expect(onValueChange.mock.calls[2]?.[0]).toBe(`prefix${pastedText}|suffix`);
  });

  it('places the caret after the inserted text when chunking finishes', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'prefix|suffix';
    textarea.selectionStart = 6;
    textarea.selectionEnd = 6;
    const setSelectionRange = vi.spyOn(textarea, 'setSelectionRange');

    insertLargeTextAtCaret({
      textarea,
      pastedText: 'abc',
      currentValue: 'prefix|suffix',
      onValueChange: vi.fn(),
      schedule: work => work(),
    });

    expect(setSelectionRange).toHaveBeenCalledWith(9, 9);
  });

  it('respects max length when inserting chunked paste', () => {
    const pastedText = 'y'.repeat(20);
    const textarea = document.createElement('textarea');
    textarea.value = 'abc';
    textarea.selectionStart = 3;
    textarea.selectionEnd = 3;

    const onValueChange = vi.fn();
    const schedule = vi.fn((work: () => void) => work());

    insertLargeTextAtCaret({
      textarea,
      pastedText,
      currentValue: 'abc',
      onValueChange,
      maxLength: 8,
      chunkSize: 3,
      schedule,
    });

    expect(onValueChange.mock.calls.at(-1)?.[0]).toBe('abcyyyyy');
  });
});
