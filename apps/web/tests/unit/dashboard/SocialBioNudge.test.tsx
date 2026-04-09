import { describe, expect, it, vi } from 'vitest';
import { SocialBioNudge } from '@/features/dashboard/molecules/SocialBioNudge';
import { fastRender } from '@/tests/utils/fast-render';

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    copy: vi.fn(),
    isError: false,
    isSuccess: false,
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SocialBioNudge', () => {
  it('renders the default pending nudge when activation data is unavailable', () => {
    const { getByText } = fastRender(
      <SocialBioNudge
        bioLinkActivation={null}
        profileId='profile_123'
        profileUrl='https://jov.ie/testartist'
      />
    );

    expect(getByText('Activate your Instagram bio link')).toBeDefined();
    expect(getByText('https://jov.ie/testartist')).toBeDefined();
  });

  it('renders the analytics CTA after Instagram activation', () => {
    const { getByRole, getByText } = fastRender(
      <SocialBioNudge
        bioLinkActivation={{
          activatedAt: '2026-04-08T00:00:00.000Z',
          copiedAt: '2026-04-07T00:00:00.000Z',
          openedAt: '2026-04-07T00:05:00.000Z',
          platform: 'instagram',
          status: 'activated',
          windowEndsAt: '2026-04-14T00:00:00.000Z',
        }}
        profileId='profile_123'
        profileUrl='https://jov.ie/testartist'
      />
    );

    expect(getByText('Instagram activated')).toBeDefined();
    expect(getByRole('link', { name: /view analytics/i })).toBeDefined();
  });
});
