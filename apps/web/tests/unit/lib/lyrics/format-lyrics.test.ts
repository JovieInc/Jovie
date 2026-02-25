import { describe, expect, it } from 'vitest';
import { formatLyricsByTarget } from '@/lib/lyrics/format-lyrics';

describe('formatLyricsByTarget', () => {
  it('removes section headers for deezer', () => {
    const input = '[Verse 1]\nLine one\n';

    const result = formatLyricsByTarget(input, 'deezer');

    expect(result.formatted).toBe('Line one\n');
    expect(result.changesSummary).toContain('Removed 1 section label(s)');
  });

  it('preserves section headers for genius', () => {
    const input = '[Verse 1]\n“Line one...”\n';

    const result = formatLyricsByTarget(input, 'genius');

    expect(result.formatted).toBe('[Verse 1]\n"Line one…"\n');
    expect(result.changesSummary).toContain(
      'Preserved section labels for Genius readability'
    );
  });
});
