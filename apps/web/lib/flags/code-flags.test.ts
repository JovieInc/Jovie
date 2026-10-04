import { afterEach, describe, expect, it } from 'vitest';

import { CODE_FLAGS, isCodeFlagEnabled } from './code-flags';

describe('code flags', () => {
  afterEach(() => {
    delete process.env.FEATURE_CANVAS_GRAIN;
  });

  it('keeps flag keys in alphabetical order so concurrent additions merge cleanly', () => {
    const keys = Object.keys(CODE_FLAGS);
    expect(keys).toEqual([...keys].sort());
  });

  it('defaults to the registry value when no env override is set', () => {
    expect(isCodeFlagEnabled('CANVAS_GRAIN')).toBe(CODE_FLAGS.CANVAS_GRAIN);
  });

  it('honors FEATURE_<FLAG_NAME> env overrides', () => {
    process.env.FEATURE_CANVAS_GRAIN = 'false';
    expect(isCodeFlagEnabled('CANVAS_GRAIN')).toBe(false);
  });

  it('keeps generic creator marketing copy off unless the env override is true', () => {
    expect(CODE_FLAGS.MARKETING_GENERIC_CREATOR_NAV).toBe(false);
    expect(isCodeFlagEnabled('MARKETING_GENERIC_CREATOR_NAV')).toBe(false);
    process.env.FEATURE_MARKETING_GENERIC_CREATOR_NAV = 'true';
    expect(isCodeFlagEnabled('MARKETING_GENERIC_CREATOR_NAV')).toBe(true);
    delete process.env.FEATURE_MARKETING_GENERIC_CREATOR_NAV;
  });

  it('keeps social HTML on an isolated provider flag that defaults off', () => {
    expect(CODE_FLAGS.SOCIAL_HTML_ISOLATED_PROVIDER).toBe(false);
    expect(isCodeFlagEnabled('SOCIAL_HTML_ISOLATED_PROVIDER')).toBe(false);
    process.env.FEATURE_SOCIAL_HTML_ISOLATED_PROVIDER = 'true';
    expect(isCodeFlagEnabled('SOCIAL_HTML_ISOLATED_PROVIDER')).toBe(true);
    delete process.env.FEATURE_SOCIAL_HTML_ISOLATED_PROVIDER;
  });

  it('keeps the auth offer summary off unless the env override is true', () => {
    expect(CODE_FLAGS.AUTH_OFFER_SUMMARY).toBe(false);
    expect(isCodeFlagEnabled('AUTH_OFFER_SUMMARY')).toBe(false);
    process.env.FEATURE_AUTH_OFFER_SUMMARY = 'true';
    expect(isCodeFlagEnabled('AUTH_OFFER_SUMMARY')).toBe(true);
    delete process.env.FEATURE_AUTH_OFFER_SUMMARY;
  });
});
