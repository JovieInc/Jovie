import { describe, expect, it } from 'vitest';
import { getRegistryEntry } from '@/lib/dsp-registry';
import { DETECTION_ONLY_DSPS, URL_ONLY_DSPS } from '@/lib/dsp-url-only';
import { DSP_GLYPH_DATA } from '@/lib/social-icons/dsp-glyph-data';

describe('URL_ONLY_DSPS brand hex', () => {
  it.each(URL_ONLY_DSPS.filter(d => d.iconKey))(
    '$key hex matches its glyph brand hex',
    d => {
      expect(d.hex).toBe(DSP_GLYPH_DATA[d.iconKey as 'vk' | 'traxsource'].hex);
    }
  );
});

describe('detection mirrors', () => {
  it.each([...URL_ONLY_DSPS, ...DETECTION_ONLY_DSPS])(
    '$key matches DSP_REGISTRY',
    d => {
      const entry = getRegistryEntry(d.key);
      expect(entry?.name).toBe(d.name);
      expect(entry?.color).toBe(`#${d.hex}`);
      expect([...(entry?.domains ?? [])]).toEqual([...d.domains]);
    }
  );
});
