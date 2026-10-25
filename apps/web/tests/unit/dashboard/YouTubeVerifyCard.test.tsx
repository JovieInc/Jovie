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

  it('asks once, framed by access, only while the owner is waiting', () => {
    mockQuery.mockReturnValue({
      data: { state: 'unverified', channel, needsAccess: true },
    });
    render(
      <YouTubeVerifyCard profileId='11111111-1111-4111-8111-111111111111' />
    );
    expect(screen.queryByText('Unverified')).toBeNull();
    const cta = screen.getByRole('link', { name: 'Connect to get access' });
    const href = new URL(cta.getAttribute('href') ?? '', 'https://x.test');
    expect(href.pathname).toBe('/api/connectors/youtube/authorize');
    expect(href.searchParams.get('creatorProfileId')).toBe(
      '11111111-1111-4111-8111-111111111111'
    );
  });

  it('only reacts to a failed attempt after the owner acted', () => {
    mockSearch.mockReturnValue('youtube_verification=mismatch');
    mockQuery.mockReturnValue({
      data: { state: 'unverified', channel, needsAccess: true },
    });
    render(<YouTubeVerifyCard profileId='p' />);
    expect(screen.getByText(/doesn't own Lena Hart/)).toBeTruthy();
  });

  it.each([
    ['loading', undefined],
    ['no candidate', { state: 'none', channel: null, needsAccess: false }],
    ['verified', { state: 'verified', channel, needsAccess: true }],
    ['already admitted', { state: 'unverified', channel, needsAccess: false }],
  ])('renders nothing when %s', (_label, data) => {
    mockQuery.mockReturnValue({ data });
    const { container } = render(<YouTubeVerifyCard profileId='p' />);
    expect(container.firstChild).toBeNull();
  });
});
