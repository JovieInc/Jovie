import { describe, expect, it } from 'vitest';
import { formatLyricsForGenius } from '@/lib/lyrics/format-lyrics-for-genius';

describe('formatLyricsForGenius', () => {
  it('preserves section labels but removes timestamps', () => {
    const input = `[Verse 1]\n[0:12]\nHello world\n\n[Chorus]\nLa la la\n`;

    const result = formatLyricsForGenius(input);

    expect(result.formatted).toContain('[Verse 1]');
    expect(result.formatted).toContain('[Chorus]');
    expect(result.formatted).not.toContain('[0:12]');
    expect(result.changesSummary).toContain('Removed 1 timestamp marker(s)');
  });

  it('normalizes section label casing', () => {
    const input = '[verse 1]\nHello\n\n[chorus]\nWorld\n';

    const result = formatLyricsForGenius(input);

    expect(result.formatted).toContain('[Verse 1]');
    expect(result.formatted).toContain('[Chorus]');
    expect(result.changesSummary).toContain('Normalized section label casing');
  });

  it('adds spacing before section headers', () => {
    const input = 'Last line of verse\n[Chorus]\nFirst chorus line\n';

    const result = formatLyricsForGenius(input);

    expect(result.formatted).toBe(
      'Last line of verse\n\n[Chorus]\nFirst chorus line\n'
    );
    expect(result.changesSummary).toContain(
      'Added spacing before section headers'
    );
  });

  it('trims trailing whitespace per line', () => {
    const input = '[Verse 1]  \nHello   \n';

    const result = formatLyricsForGenius(input);

    expect(result.formatted).toBe('[Verse 1]\nHello\n');
    expect(result.changesSummary).toContain('Trimmed trailing whitespace');
  });

  it('reports no changes when already formatted', () => {
    const input = '[Verse 1]\nPerfect lyrics\n';

    const result = formatLyricsForGenius(input);

    expect(result.formatted).toBe('[Verse 1]\nPerfect lyrics\n');
    expect(result.changesSummary).toContain(
      'No changes needed — lyrics already formatted'
    );
  });
});
