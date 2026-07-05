import { describe, expect, it } from 'vitest';
import {
  classifySyntheticAudienceMember,
  isUrlEncodedGeoCity,
  SEED_FINGERPRINT_PREFIX,
} from './synthetic-audience-markers';

describe('synthetic-audience-markers', () => {
  it('detects seed script fingerprints and emails', () => {
    expect(
      classifySyntheticAudienceMember({
        fingerprint: `${SEED_FINGERPRINT_PREFIX}8473a72f_12`,
        email: 'seed.aud.8473a7.12@example.com',
        geoCity: 'Los Angeles',
      })
    ).toEqual(['seed-fingerprint', 'seed-email']);
  });

  it('detects demo seed fingerprints and emails', () => {
    expect(
      classifySyntheticAudienceMember({
        fingerprint: 'fp_demo_3',
        email: 'demo.aud.3@example.com',
        geoCity: 'Nashville',
      })
    ).toEqual(['demo-fingerprint', 'demo-email']);
  });

  it('detects URL-encoded geo cities from undecoded Vercel headers', () => {
    expect(isUrlEncodedGeoCity('Los%20Angeles')).toBe(true);
    expect(isUrlEncodedGeoCity('Forest%20City')).toBe(true);
    expect(isUrlEncodedGeoCity('Los Angeles')).toBe(false);

    expect(
      classifySyntheticAudienceMember({
        fingerprint: 'fp_realhash',
        email: null,
        geoCity: 'San%20Jose',
      })
    ).toEqual(['encoded-geo-city']);
  });

  it('returns no reasons for organic-looking members', () => {
    expect(
      classifySyntheticAudienceMember({
        fingerprint: 'fp_8f3c2a1b9d0e',
        email: 'fan@gmail.com',
        geoCity: 'Austin',
      })
    ).toEqual([]);
  });
});
