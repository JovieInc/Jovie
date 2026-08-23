import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSmartLinkUrl,
  HOSTNAME,
  isMainDomain,
  isPreviewEnvironment,
  isProductionEnvironment,
} from '@/constants/domains';

const originalProfileUrl = process.env.NEXT_PUBLIC_PROFILE_URL;

afterEach(() => {
  if (originalProfileUrl === undefined) {
    delete process.env.NEXT_PUBLIC_PROFILE_URL;
  } else {
    process.env.NEXT_PUBLIC_PROFILE_URL = originalProfileUrl;
  }
  vi.resetModules();
});

describe('domains', () => {
  it('treats staging and legacy staging hostnames as main-domain hosts', () => {
    expect(isMainDomain(`staging.${HOSTNAME}`)).toBe(true);
    expect(isMainDomain(`main.${HOSTNAME}`)).toBe(true);
  });

  it('treats staging and legacy staging hostnames as preview environments', () => {
    expect(isPreviewEnvironment(`staging.${HOSTNAME}`)).toBe(true);
    expect(isPreviewEnvironment(`main.${HOSTNAME}`)).toBe(true);
  });

  it('keeps production detection scoped to the canonical production host', () => {
    expect(isPreviewEnvironment(HOSTNAME)).toBe(false);
    expect(isProductionEnvironment(HOSTNAME)).toBe(true);
    expect(isProductionEnvironment(`staging.${HOSTNAME}`)).toBe(false);
  });

  it('keeps public smart links on the canonical origin', () => {
    expect(getSmartLinkUrl('/calvin-demo/summer')).toBe(
      'https://jov.ie/calvin-demo/summer'
    );
    expect(getSmartLinkUrl('calvin-demo/summer')).toBe(
      'https://jov.ie/calvin-demo/summer'
    );
  });

  it('does not leak a staging or preview origin into copied public links', async () => {
    process.env.NEXT_PUBLIC_PROFILE_URL = 'https://staging.jov.ie';
    vi.resetModules();
    const { getSmartLinkUrl: getSmartLinkUrlWithStagingEnv } = await import(
      '@/constants/domains'
    );

    expect(getSmartLinkUrlWithStagingEnv('/artist/release')).toBe(
      'https://jov.ie/artist/release'
    );
  });
});
