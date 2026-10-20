import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeFetchPublicHtml } from '@/lib/ai/tools/safe-fetch-public-html';
import { emptyOnboardingProfileDraft } from './profile-draft';
import { prepareOnboardingProfileDraft } from './profile-draft.server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/tools/safe-fetch-public-html', () => ({
  safeFetchPublicHtml: vi.fn(),
}));

describe('onboarding source enrichment', () => {
  beforeEach(() => vi.resetAllMocks());
  it('restores a server-confirmed music source without inventing an artist for other roles', async () => {
    const draft = await prepareOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      { id: 'pick', text: 'selected' },
      '4Uwpa6zW3zzCSQvooQNksm'
    );
    expect(draft.roles).toEqual(['artist']);
    expect(draft.awaiting).toBe('outcome');
    expect(draft.selectedSource?.url).toContain(
      '/artist/4Uwpa6zW3zzCSQvooQNksm'
    );
    const mixed = await prepareOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      { id: 'mixed', text: 'I am a founder' },
      '4Uwpa6zW3zzCSQvooQNksm'
    );
    expect(mixed.activeRole).toBeNull();
    expect(mixed.awaiting).toBe('priority');
    expect(safeFetchPublicHtml).not.toHaveBeenCalled();
  });
  it('reuses the importer, keeps selected identity and does not refetch on resume', async () => {
    vi.mocked(safeFetchPublicHtml).mockResolvedValue({
      ok: true,
      finalUrl: 'https://company.example/about',
      sourceTitle: 'Acme product',
      html: '<meta name="description" content="Tools for small teams to manage projects together.">',
    });
    const draft = await prepareOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      { id: 'first', text: 'I am a founder https://company.example' },
      null
    );
    expect(draft.selectedSource).toMatchObject({
      url: 'https://company.example/',
      status: 'available',
      title: 'Acme product',
      description: 'Tools for small teams to manage projects together.',
    });
    await prepareOnboardingProfileDraft(
      draft,
      { id: 'second', text: 'I want buyer contact' },
      null
    );
    expect(safeFetchPublicHtml).toHaveBeenCalledTimes(1);
    vi.mocked(safeFetchPublicHtml).mockResolvedValue({
      ok: false,
      error: 'timeout',
    });
    const failedRetry = await prepareOnboardingProfileDraft(
      draft,
      { id: 'retry', text: 'retry' },
      null
    );
    expect(failedRetry.selectedSource).toMatchObject({
      status: 'unavailable',
      title: null,
      description: null,
      fetchedAt: null,
    });
  });
  it('keeps an unavailable source and supports explicit retry', async () => {
    vi.mocked(safeFetchPublicHtml).mockResolvedValue({
      ok: false,
      error: 'auth_walled',
    });
    const draft = await prepareOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      { id: 'first', text: 'I am an expert https://services.example' },
      null
    );
    expect(draft.selectedSource).toMatchObject({
      status: 'unavailable',
      title: null,
      description: null,
    });
    await prepareOnboardingProfileDraft(
      draft,
      { id: 'second', text: 'retry' },
      null
    );
    expect(safeFetchPublicHtml).toHaveBeenCalledTimes(2);
    expect(draft.activeRole).toBe('expert');
  });
  it('handles thrown failures and never sends music or ambiguous identity to the website importer', async () => {
    vi.mocked(safeFetchPublicHtml).mockRejectedValue(new Error('offline'));
    expect(
      (
        await prepareOnboardingProfileDraft(
          emptyOnboardingProfileDraft(),
          { id: 'offline', text: 'author https://books.example' },
          null
        )
      ).selectedSource?.status
    ).toBe('unavailable');
    vi.mocked(safeFetchPublicHtml).mockClear();
    await prepareOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      {
        id: 'music',
        text: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
      },
      '4Uwpa6zW3zzCSQvooQNksm'
    );
    await prepareOnboardingProfileDraft(
      emptyOnboardingProfileDraft(),
      {
        id: 'ambiguous',
        text: 'founder https://one.example https://two.example',
      },
      null
    );
    expect(safeFetchPublicHtml).not.toHaveBeenCalled();
  });
});
