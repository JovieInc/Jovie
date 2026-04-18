import { describe, expect, it } from 'vitest';
import {
  HOSTNAME,
  isMainDomain,
  isPreviewEnvironment,
  isProductionEnvironment,
} from '@/constants/domains';

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
});
