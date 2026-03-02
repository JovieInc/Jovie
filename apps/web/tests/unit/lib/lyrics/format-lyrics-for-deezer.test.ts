import { describe, expect, it } from 'vitest';
import { formatLyricsForDeezer } from '@/lib/lyrics/format-lyrics-for-deezer';

describe('formatLyricsForDeezer', () => {
  it('removes section labels and timestamps', () => {
    const input = `[Verse 1]\n[0:12]\nHello world\n\n[Chorus]\nLa la la\n`;

    const result = formatLyricsForDeezer(input);

    expect(result.formatted).toBe('Hello world\n\nLa la la\n');
    expect(result.changesSummary).toContain('Removed 2 section label(s)');
    expect(result.changesSummary).toContain('Removed 1 timestamp marker(s)');
  });

  it('collapses excessive blank lines to one', () => {
    const input = 'Line one\n\n\n\n\nLine two\n';

    const result = formatLyricsForDeezer(input);

    expect(result.formatted).toBe('Line one\n\nLine two\n');
    expect(result.changesSummary).toContain('Collapsed excessive blank lines');
  });

  it('trims trailing whitespace per line', () => {
    const input = 'Hello   \nworld\n';

    const result = formatLyricsForDeezer(input);

    expect(result.formatted).toBe('Hello\nworld\n');
    expect(result.changesSummary).toContain('Trimmed trailing whitespace');
  });

  it('reports no changes when already formatted', () => {
    const input = 'Perfect lyrics\n';

    const result = formatLyricsForDeezer(input);

    expect(result.formatted).toBe('Perfect lyrics\n');
    expect(result.changesSummary).toContain(
      'No changes needed — lyrics already formatted'
    );
  });
});
