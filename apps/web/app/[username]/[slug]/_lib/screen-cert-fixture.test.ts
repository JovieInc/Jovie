import { describe, expect, it } from 'vitest';
import { isReservedPublicProfileIdentity } from '@/lib/profile/public-profile-identity-policy';
import {
  isScreenCertSmartLinkProfileRequest,
  SCREEN_CERT_SMARTLINK_FIXTURE_CREATOR,
  SCREEN_CERT_SMARTLINK_RELEASE_CONTENT,
  SCREEN_CERT_SMARTLINK_RELEASE_SLUG,
  SCREEN_CERT_SMARTLINK_TRACK_CONTENT,
  SCREEN_CERT_SMARTLINK_TRACK_SLUG,
  SCREEN_CERT_SMARTLINK_USERNAME,
} from './screen-cert-fixture';

describe('smartlink screen-cert fixture (JOV-7127)', () => {
  it('reserves the fixture handle so no real creator can ever claim it', () => {
    expect(
      isReservedPublicProfileIdentity(SCREEN_CERT_SMARTLINK_USERNAME)
    ).toBe(true);
  });

  it('keeps the fixture creator normalized to the reserved handle', () => {
    expect(SCREEN_CERT_SMARTLINK_FIXTURE_CREATOR.usernameNormalized).toBe(
      SCREEN_CERT_SMARTLINK_USERNAME
    );
    expect(SCREEN_CERT_SMARTLINK_FIXTURE_CREATOR.username).toBe(
      SCREEN_CERT_SMARTLINK_USERNAME
    );
  });

  it('keeps the release fixture internally consistent', () => {
    expect(SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.type).toBe('release');
    expect(SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.slug).toBe(
      SCREEN_CERT_SMARTLINK_RELEASE_SLUG
    );
    expect(
      SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.providerLinks.length
    ).toBeGreaterThan(0);
    expect(
      SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.releaseDate!.getTime()
    ).toBeLessThan(Date.now());
  });

  it('admits the profile root only for the reserved handle inside the fixture gate', () => {
    const captureEnv = {
      CI: 'true',
      NODE_ENV: 'production',
      PUBLIC_NOAUTH_SMOKE: '1',
    } as const;

    expect(
      isScreenCertSmartLinkProfileRequest(
        SCREEN_CERT_SMARTLINK_USERNAME,
        captureEnv
      )
    ).toBe(true);
    expect(
      isScreenCertSmartLinkProfileRequest('Jovie-Screen-Fixture', captureEnv)
    ).toBe(true);
    expect(isScreenCertSmartLinkProfileRequest('unfazed', captureEnv)).toBe(
      false
    );
    expect(
      isScreenCertSmartLinkProfileRequest(SCREEN_CERT_SMARTLINK_USERNAME, {
        ...captureEnv,
        VERCEL_ENV: 'production',
      })
    ).toBe(false);
    expect(
      isScreenCertSmartLinkProfileRequest(SCREEN_CERT_SMARTLINK_USERNAME, {
        NODE_ENV: 'production',
        PUBLIC_NOAUTH_SMOKE: '1',
      })
    ).toBe(false);
  });

  it('keeps the track fixture pointed at its parent release fixture', () => {
    expect(SCREEN_CERT_SMARTLINK_TRACK_CONTENT.type).toBe('track');
    expect(SCREEN_CERT_SMARTLINK_TRACK_CONTENT.slug).toBe(
      SCREEN_CERT_SMARTLINK_TRACK_SLUG
    );
    expect(SCREEN_CERT_SMARTLINK_TRACK_CONTENT.releaseId).toBe(
      SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.id
    );
    expect(SCREEN_CERT_SMARTLINK_TRACK_CONTENT.releaseSlug).toBe(
      SCREEN_CERT_SMARTLINK_RELEASE_SLUG
    );
    expect(SCREEN_CERT_SMARTLINK_TRACK_CONTENT.releaseTitle).toBe(
      SCREEN_CERT_SMARTLINK_RELEASE_CONTENT.title
    );
  });
});
