import { describe, expect, it } from 'vitest';
import { detectSlashTriggerAt } from './slash-trigger';

describe('detectSlashTriggerAt', () => {
  it('returns null for empty input', () => {
    expect(detectSlashTriggerAt('', 0)).toBeNull();
  });

  it('returns null for text with no slash', () => {
    expect(detectSlashTriggerAt('hello world', 11)).toBeNull();
  });

  it('detects slash at start of input', () => {
    expect(detectSlashTriggerAt('/gen', 4)).toEqual({
      startIdx: 0,
      query: 'gen',
    });
  });

  it('detects bare slash with empty query', () => {
    expect(detectSlashTriggerAt('/', 1)).toEqual({ startIdx: 0, query: '' });
  });

  it('detects slash after whitespace', () => {
    expect(detectSlashTriggerAt('hey /gen', 8)).toEqual({
      startIdx: 4,
      query: 'gen',
    });
  });

  it('does not trigger on slash mid-word', () => {
    expect(detectSlashTriggerAt('a/b', 3)).toBeNull();
  });

  it('does not trigger when second slash appears after', () => {
    expect(detectSlashTriggerAt('/foo/bar', 8)).toBeNull();
  });

  it('does not trigger when whitespace appears in the query', () => {
    expect(detectSlashTriggerAt('/gen art', 8)).toBeNull();
  });

  it('respects the caret position, ignoring text after it', () => {
    // Caret between `/ge` and `n` — query is just 'ge'.
    expect(detectSlashTriggerAt('hey /gen stuff', 7)).toEqual({
      startIdx: 4,
      query: 'ge',
    });
  });

  it('handles newline as word boundary', () => {
    expect(detectSlashTriggerAt('first line\n/gen', 15)).toEqual({
      startIdx: 11,
      query: 'gen',
    });
  });
});
