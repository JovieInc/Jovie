import { describe, expect, it } from 'vitest';
import { formatLyricsForAppleMusic } from '@/lib/lyrics/format-lyrics-for-apple-music';

describe('formatLyricsForAppleMusic', () => {
  it('removes section labels and timestamps and normalizes punctuation', () => {
    const input = `[Verse 1]\n[0:12]\n“Hello...”  world!!\n\n\n\n`;

    const result = formatLyricsForAppleMusic(input);

    expect(result.formatted).toBe('"Hello…" world!\n');
    expect(result.changesSummary).toContain('Removed 1 section label(s)');
    expect(result.changesSummary).toContain('Removed 1 timestamp marker(s)');
  });

  it('reports cleanup when extra blank lines are present', () => {
    const input = 'Perfectly formatted line\n\n';

    const result = formatLyricsForAppleMusic(input);

    expect(result.formatted).toBe('Perfectly formatted line\n');
    expect(result.changesSummary).toContain(
      'Removed leading/trailing blank lines'
    );
  });
});
