import { describe, expect, it } from 'vitest';
import { DSP_PROFILE_CATALOG } from '@/lib/connectors/dsp-profile-catalog';
import {
  canExecuteBioSubmission,
  getBioSubmissionManifest,
  getProfileDestination,
} from '@/lib/connectors/profile-writes/destinations';
import { getEnabledBioProviders } from './providers';

describe('DSP bio catalog', () => {
  it('does not infer current terms evidence from historical support addresses', () => {
    expect(getEnabledBioProviders()).toEqual([]);
    expect(() => getBioSubmissionManifest('soundcloud')).toThrow(
      'unsupported-bio-method'
    );
    expect(() => getBioSubmissionManifest('youtube_music')).toThrow(
      'unsupported-bio-method'
    );
  });

  it('derives submission identities and transport from the canonical DSP catalog', () => {
    for (const destination of Object.values(DSP_PROFILE_CATALOG)) {
      const id = destination.legacyBioProviderId;
      const submission = getProfileDestination(id);
      expect(submission).toMatchObject({
        label: destination.label,
        method: destination.transport.legacyBio,
        portal: destination.artistPortalUrl,
        maxBioLength: expect.any(Number),
      });
      if (submission?.method === 'email') {
        const manifest = getBioSubmissionManifest(id);
        expect(canExecuteBioSubmission(manifest)).toBe(false);
      }
    }
    expect(getProfileDestination('youtube')).toBeUndefined();
    expect(getProfileDestination('not-a-dsp')).toBeUndefined();
  });
});
