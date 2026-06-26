import { describe, expect, it } from 'vitest';
import {
  getNichePriors,
  PACKAGING_NICHE_PRIORS,
} from '@/lib/services/packaging-intelligence/priors';
import { packagingNicheSchema } from '@/lib/services/packaging-intelligence/types';

describe('PACKAGING_NICHE_PRIORS', () => {
  it('defines priors for every canonical niche', () => {
    for (const niche of packagingNicheSchema.options) {
      expect(PACKAGING_NICHE_PRIORS[niche]).toEqual({
        faceEffect: expect.stringMatching(/^(helps|hurts|neutral)$/),
        source: '1of10',
      });
    }
  });

  it('maps gaming to face hurts per 1of10 defaults', () => {
    expect(getNichePriors('gaming')).toEqual({
      faceEffect: 'hurts',
      source: '1of10',
    });
  });

  it('maps lifestyle vlog to face helps per 1of10 defaults', () => {
    expect(getNichePriors('lifestyle_vlog')).toEqual({
      faceEffect: 'helps',
      source: '1of10',
    });
  });
});
