import { describe, expect, it } from 'vitest';
import {
  mergeHostnameAllowlist,
  missingHostnames,
  PRODUCTION_TURNSTILE_HOSTNAMES,
  resolveHostnameTarget,
  STAGING_TURNSTILE_HOSTNAMES,
} from '../../../../../scripts/turnstile-config';

describe('scripts/turnstile-config.ts', () => {
  it('defines production hostnames required for jov.ie signup', () => {
    expect(PRODUCTION_TURNSTILE_HOSTNAMES).toEqual(['jov.ie', 'www.jov.ie']);
  });

  it('defines staging hostnames for pre-prod verification', () => {
    expect(STAGING_TURNSTILE_HOSTNAMES).toEqual([
      'staging.jov.ie',
      'main.jov.ie',
    ]);
  });

  it('resolves hostname targets explicitly', () => {
    expect(resolveHostnameTarget('prod')).toEqual(
      PRODUCTION_TURNSTILE_HOSTNAMES
    );
    expect(resolveHostnameTarget('staging')).toEqual(
      STAGING_TURNSTILE_HOSTNAMES
    );
    expect(resolveHostnameTarget('all')).toEqual([
      ...PRODUCTION_TURNSTILE_HOSTNAMES,
      ...STAGING_TURNSTILE_HOSTNAMES,
    ]);
  });

  it('merges hostnames without duplicates and normalizes casing', () => {
    expect(
      mergeHostnameAllowlist(
        ['meetjovie.com', 'JOV.IE'],
        ['jov.ie', 'www.jov.ie']
      )
    ).toEqual(['jov.ie', 'meetjovie.com', 'www.jov.ie']);
  });

  it('reports missing required hostnames only', () => {
    expect(
      missingHostnames(
        ['meetjovie.com', 'staging.jov.ie'],
        ['jov.ie', 'www.jov.ie']
      )
    ).toEqual(['jov.ie', 'www.jov.ie']);

    expect(
      missingHostnames(
        ['jov.ie', 'www.jov.ie', 'meetjovie.com'],
        ['jov.ie', 'www.jov.ie']
      )
    ).toEqual([]);
  });
});
