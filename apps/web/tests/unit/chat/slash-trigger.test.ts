import { describe, expect, it } from 'vitest';

import { detectSlashTriggerAt } from '@/components/jovie/components/slash-trigger';

describe('detectSlashTriggerAt — base trigger', () => {
  it('returns null when there is no slash before the caret', () => {
    expect(detectSlashTriggerAt('hello world', 5)).toBeNull();
  });

  it('detects a leading-slash trigger', () => {
    const result = detectSlashTriggerAt('/foo', 4);
    expect(result).toEqual({ startIdx: 0, query: 'foo' });
  });

  it('detects a slash after whitespace mid-text', () => {
    const result = detectSlashTriggerAt('hey /foo', 8);
    expect(result).toEqual({ startIdx: 4, query: 'foo' });
  });

  it('does not trigger on mid-word slashes', () => {
    expect(detectSlashTriggerAt('a/foo', 5)).toBeNull();
  });

  it('opens with empty query when only `/` is typed', () => {
    expect(detectSlashTriggerAt('/', 1)).toEqual({ startIdx: 0, query: '' });
  });
});

describe('detectSlashTriggerAt — direct entry', () => {
  it('promotes `/release ` to directKind=release with empty query', () => {
    const result = detectSlashTriggerAt('/release ', 9);
    expect(result).toEqual({
      startIdx: 0,
      query: '',
      directKind: 'release',
    });
  });

  it('promotes `/release midnight` to directKind=release with stripped query', () => {
    const result = detectSlashTriggerAt('/release midnight', 17);
    expect(result).toEqual({
      startIdx: 0,
      query: 'midnight',
      directKind: 'release',
    });
  });

  it('promotes `/event ` to directKind=event with empty query', () => {
    const result = detectSlashTriggerAt('/event ', 7);
    expect(result).toEqual({
      startIdx: 0,
      query: '',
      directKind: 'event',
    });
  });

  it('promotes `/artist KAYTRANADA` to directKind=artist with stripped query', () => {
    const result = detectSlashTriggerAt('/artist KAYTRANADA', 18);
    expect(result).toEqual({
      startIdx: 0,
      query: 'KAYTRANADA',
      directKind: 'artist',
    });
  });

  it('treats `/randomword` as regular root mode (no directKind)', () => {
    const result = detectSlashTriggerAt('/randomword', 11);
    expect(result).toEqual({ startIdx: 0, query: 'randomword' });
  });

  it('promotes `/Release foo` case-insensitively to directKind=release', () => {
    const result = detectSlashTriggerAt('/Release foo', 12);
    expect(result).toEqual({
      startIdx: 0,
      query: 'foo',
      directKind: 'release',
    });
  });

  it('promotes mid-text `hey /event Brooklyn Steel`', () => {
    const text = 'hey /event Brooklyn Steel';
    const result = detectSlashTriggerAt(text, text.length);
    expect(result).toEqual({
      startIdx: 4,
      query: 'Brooklyn Steel',
      directKind: 'event',
    });
  });

  it('does not promote `/track ` (no track provider yet)', () => {
    // The strict TRIGGER_PATTERN forbids spaces, so this whole string
    // returns null until a non-space query character lands. That's the
    // intended behavior: `/track` (no space) parses as root.
    expect(detectSlashTriggerAt('/track', 6)).toEqual({
      startIdx: 0,
      query: 'track',
    });
    expect(detectSlashTriggerAt('/track ', 7)).toBeNull();
  });

  it('does not promote unknown prefix like `/foo bar`', () => {
    // Unknown prefix with a space falls through and returns null —
    // there's no reasonable root-mode interpretation once a space
    // appears (root-mode query refuses spaces by design).
    expect(detectSlashTriggerAt('/foo bar', 8)).toBeNull();
  });
});
