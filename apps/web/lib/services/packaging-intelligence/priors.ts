import type { FaceEffect, PackagingNiche } from './types';

export interface NichePriors {
  readonly faceEffect: FaceEffect;
  readonly source: '1of10';
}

/**
 * Default face-in-thumbnail priors from the 1of10 300k-video dataset.
 * Channel experiment data overrides these defaults at generation time.
 */
export const PACKAGING_NICHE_PRIORS: Record<PackagingNiche, NichePriors> = {
  entertainment: { faceEffect: 'helps', source: '1of10' },
  education: { faceEffect: 'neutral', source: '1of10' },
  gaming: { faceEffect: 'hurts', source: '1of10' },
  tech: { faceEffect: 'hurts', source: '1of10' },
  finance: { faceEffect: 'neutral', source: '1of10' },
  lifestyle_vlog: { faceEffect: 'helps', source: '1of10' },
  news_commentary: { faceEffect: 'helps', source: '1of10' },
  music: { faceEffect: 'neutral', source: '1of10' },
  fitness_health: { faceEffect: 'helps', source: '1of10' },
  food_cooking: { faceEffect: 'neutral', source: '1of10' },
  beauty_fashion: { faceEffect: 'helps', source: '1of10' },
  sports: { faceEffect: 'helps', source: '1of10' },
  diy_howto: { faceEffect: 'hurts', source: '1of10' },
  science: { faceEffect: 'neutral', source: '1of10' },
  travel: { faceEffect: 'helps', source: '1of10' },
  business: { faceEffect: 'helps', source: '1of10' },
  automotive: { faceEffect: 'neutral', source: '1of10' },
  parenting: { faceEffect: 'helps', source: '1of10' },
  other: { faceEffect: 'neutral', source: '1of10' },
};

export function getNichePriors(niche: PackagingNiche): NichePriors {
  return PACKAGING_NICHE_PRIORS[niche];
}
