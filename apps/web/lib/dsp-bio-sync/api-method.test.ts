import { describe, expect, it } from 'vitest';
import { getBioSubmissionManifest } from '@/lib/connectors/profile-writes/destinations';
import { DSP_BIO_PROVIDERS, getEnabledBioProviders } from './providers';

describe('DSP bio catalog', () => {
  it('does not infer current terms evidence from historical support addresses', () => {
    expect(getEnabledBioProviders()).toEqual([]);
    expect(
      Object.values(DSP_BIO_PROVIDERS).every(provider => !provider.enabled)
    ).toBe(true);
    expect(() => getBioSubmissionManifest('soundcloud')).toThrow(
      'unsupported-bio-method'
    );
  });
});
