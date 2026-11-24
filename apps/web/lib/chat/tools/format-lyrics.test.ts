import { describe, expect, it } from 'vitest';
import { createFormatLyricsTool } from './format-lyrics';

/**
 * Outcome check for chat's lyrics ask (chat-creative, JOV-14474), registered
 * in docs/product/outcome-coverage.json: lyrics pasted in chat must come back
 * as text Apple Music will take, not a description of what could be done.
 */

type Execute = (input: { lyrics: string }) => Promise<{
  success: boolean;
  formatted: string;
  changesSummary: string[];
  originalLineCount: number;
  formattedLineCount: number;
}>;

const formatLyrics = createFormatLyricsTool().execute as unknown as Execute;

describe('formatLyrics chat tool', () => {
  it('lyrics pasted in chat come back ready for Apple Music', async () => {
    const pasted = [
      '[Verse 1]',
      '“Night bus” rolling   through the rain...',
      'I don’t wanna go home!!',
      '',
      '',
      '',
      '[Chorus]',
      'hold on -- hold on',
      '  [0:42] we’re almost there??  ',
      '',
    ].join('\n');

    const result = await formatLyrics({ lyrics: pasted });

    expect(result.success).toBe(true);
    expect(result.formatted).toBe(
      [
        '"Night bus" rolling through the rain…',
        "I don't wanna go home!",
        '',
        'hold on — hold on',
        "we're almost there?",
        '',
      ].join('\n')
    );
    expect(result.changesSummary).toEqual(
      expect.arrayContaining([
        'Removed 2 section label(s)',
        'Removed 1 timestamp marker(s)',
        'Straightened curly quotes',
        'Trimmed leading whitespace',
      ])
    );
    expect(result.originalLineCount).toBe(10);
    expect(result.formattedLineCount).toBe(6);
  });

  it('says so when the lyrics already meet the rules', async () => {
    const result = await formatLyrics({ lyrics: 'Already clean\n' });

    expect(result.formatted).toBe('Already clean\n');
    expect(result.changesSummary).toEqual([
      'No changes needed — lyrics already formatted',
    ]);
  });
});
