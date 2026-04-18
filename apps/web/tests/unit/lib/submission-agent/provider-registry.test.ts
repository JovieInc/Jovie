import { describe, expect, it } from 'vitest';
import {
  assertSupportedSubmissionProviders,
  getSubmissionProvider,
  getSubmissionProviders,
} from '@/lib/submission-agent/providers/registry';

describe('submission provider registry', () => {
  it('includes the launch provider', () => {
    const providers = getSubmissionProviders();
    expect(
      providers.some(provider => provider.id === 'xperi_allmusic_email')
    ).toBe(true);
  });

  it('returns registered providers by id', () => {
    expect(
      getSubmissionProvider('xperi_allmusic_email')?.displayName
    ).toContain('Xperi');
    expect(
      getSubmissionProvider('musicbrainz_authenticated_edit')?.transport
    ).toBe('authenticated_edit');
  });

  it('rejects unsupported provider ids for preparation', () => {
    expect(() =>
      assertSupportedSubmissionProviders(['musicbrainz_authenticated_edit'])
    ).toThrow('Unsupported submission provider');
  });
});
