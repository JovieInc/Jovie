import { describe, expect, it } from 'vitest';
import { PROVIDER_TO_DSP } from '@/lib/discography/provider-domains';

describe('PROVIDER_TO_DSP', () => {
  it('maps YouTube providers to DSP icons on listen surfaces', () => {
    expect(PROVIDER_TO_DSP.youtube).toBe('youtube');
    expect(PROVIDER_TO_DSP.youtube_music).toBe('youtube_music');
  });
});
