import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubeVerifyCard } from '@/components/features/dashboard/organisms/profile-contact-sidebar/YouTubeVerifyCard';

const { mockQuery, mockSearch } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockSearch: vi.fn(),
}));

vi.mock('@/lib/queries/useYouTubeVerificationQuery', () => ({
  useYouTubeVerificationQuery: mockQuery,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard/profile',
  useSearchParams: () => new URLSearchParams(mockSearch()),
}));

const channel = {
  title: 'Lena Hart',
  url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv',
};

describe('YouTubeVerifyCard', () => {
  beforeEach(() => {
    mockSearch.mockReturnValue('');
  });

  it('shows an unverified channel with a one-tap connect to verify', () => {
    mockQuery.mockReturnValue({ data: { state: 'unverified', channel } });
    render(
      <YouTubeVerifyCard profileId='11111111-1111-4111-8111-111111111111' />
    );
    expect(screen.getByTestId('youtube-verify-status').textContent).toBe(
      'Unverified'
    );
    const cta = screen.getByRole('link', {
      name: 'Connect YouTube to verify',
    });
    const href = new URL(cta.getAttribute('href') ?? '', 'https://x.test');
    expect(href.pathname).toBe('/api/connectors/youtube/authorize');
    expect(href.searchParams.get('creatorProfileId')).toBe(
      '11111111-1111-4111-8111-111111111111'
    );
    expect(href.searchParams.get('returnTo')).toBe('/app/dashboard/profile');
  });

  it('shows verified without a connect prompt', () => {
    mockQuery.mockReturnValue({ data: { state: 'verified', channel } });
    render(<YouTubeVerifyCard profileId='p' />);
    expect(screen.getByTestId('youtube-verify-status').textContent).toBe(
      'Verified'
    );
    expect(screen.queryByText('Connect YouTube to verify')).toBeNull();
  });

  it('explains an ownership mismatch and stays unverified', () => {
    mockSearch.mockReturnValue('youtube_verification=mismatch');
    mockQuery.mockReturnValue({ data: { state: 'unverified', channel } });
    render(<YouTubeVerifyCard profileId='p' />);
    expect(screen.getByTestId('youtube-verify-mismatch')).toBeTruthy();
    expect(screen.getByText('Connect YouTube to verify')).toBeTruthy();
  });

  it.each([
    ['loading', undefined],
    ['no candidate', { state: 'none', channel: null }],
  ])('renders nothing when %s', (_label, data) => {
    mockQuery.mockReturnValue({ data });
    const { container } = render(<YouTubeVerifyCard profileId='p' />);
    expect(container.firstChild).toBeNull();
  });
});
