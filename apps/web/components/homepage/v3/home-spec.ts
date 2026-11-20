import { DSP_REGISTRY, STREAMING_DSP_KEYS } from '@/lib/dsp-registry';

/**
 * Homepage spec numbers, derived from the DSP registry (the single source).
 * Never hard-code them: when the registry grows, the specs sheet, the meter,
 * the release page's "+N more services" and the captions follow.
 */
export const HOME_SPEC = {
  /** Streaming services shown on a release's listen page. */
  listen: STREAMING_DSP_KEYS.length,
  /** Every service the registry recognises (streaming, video, metadata). */
  recognised: DSP_REGISTRY.length,
  /** Services drawn on the release page before "+N more services". */
  shownServices: 5,
} as const;

export interface DspGlyphData {
  readonly key: string;
  readonly name: string;
  readonly color: string;
  readonly viewBox: string;
  readonly path: string;
}

const VIEWBOX = /viewBox="([^"]+)"/u;
const PATH = /<path[^>]*\sd="([^"]+)"/u;

/** One registry logo as plain path data, so it renders without innerHTML. */
export function dspGlyph(key: string): DspGlyphData {
  const entry = DSP_REGISTRY.find(item => item.key === key);
  if (!entry) throw new Error(`Unknown DSP key: ${key}`);
  const path = PATH.exec(entry.logoSvg)?.[1];
  if (!path) throw new Error(`DSP logo has no path: ${key}`);
  return {
    key,
    name: entry.name,
    color: entry.color,
    viewBox: VIEWBOX.exec(entry.logoSvg)?.[1] ?? '0 0 24 24',
    path,
  };
}

/** The three services each catalog row shows (illustrative presence). */
export const ROW_SERVICES = ['spotify', 'apple_music', 'youtube_music'].map(
  dspGlyph
);

/** The services the release page lists before "+N more". */
export const RELEASE_PAGE_SERVICES = [
  'spotify',
  'apple_music',
  'youtube_music',
  'soundcloud',
  'youtube',
].map(dspGlyph);
