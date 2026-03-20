import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';

/* ------------------------------------------------------------------ */
/*  Shared release data for hero and releases sections                  */
/* ------------------------------------------------------------------ */

export const RELEASES = [
  {
    id: 'never-say-a-word',
    title: 'Never Say A Word',
    year: '2024',
    type: 'Single',
    artwork: '/img/releases/never-say-a-word.jpg',
    slug: 'tim/never-say-a-word',
    isNew: true,
  },
  {
    id: 'deep-end',
    title: 'The Deep End',
    year: '2017',
    type: 'Single',
    artwork: '/img/releases/the-deep-end.jpg',
    slug: 'tim/the-deep-end',
    isNew: false,
  },
  {
    id: 'take-me-over',
    title: 'Take Me Over',
    year: '2014',
    type: 'Single',
    artwork: '/img/releases/take-me-over.jpg',
    slug: 'tim/take-me-over',
    isNew: false,
  },
] as const;

export type Release = (typeof RELEASES)[number];

export const SMART_LINK_DSPS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon_music',
] as const;

export const DSP_LABELS: Record<string, string> = {
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
  amazon_music: 'Amazon Music',
};

export function getDspConfig(key: string) {
  return DSP_LOGO_CONFIG[key as keyof typeof DSP_LOGO_CONFIG];
}
