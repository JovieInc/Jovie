import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreator } from '@/hooks/useCreator';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CreatorProfile } from './CreatorProfile';

vi.mock('@/hooks/useCreator', () => ({ useCreator: vi.fn() }));

type Creator = NonNullable<ReturnType<typeof useCreator>['creator']>;
type Link = Creator['socialLinks'][number];

const link = (index: number, extra: Partial<Link> = {}): Link => ({
  id: `link-${index}`,
  platform: 'instagram',
  platformType: 'social',
  url: `https://instagram.com/sample-${index}`,
  displayText: `Link ${index}`,
  clicks: 0,
  isActive: true,
  sortOrder: index,
  ...extra,
});

const creator: Creator = {
  id: 'creator-1',
  username: 'sample-artist',
  usernameNormalized: 'sample-artist',
  displayName: 'Sample Artist',
  bio: 'Producer and DJ.',
  avatarUrl: null,
  creatorType: 'artist',
  spotifyUrl: null,
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: null,
  isPublic: true,
  isVerified: false,
  isClaimed: true,
  isFeatured: false,
  marketingOptOut: false,
  settings: null,
  theme: null,
  socialLinks: [link(1)],
};

function mockCreator(value: Partial<ReturnType<typeof useCreator>>) {
  vi.mocked(useCreator).mockReturnValue({
    creator,
    loading: false,
    error: null,
    ...value,
  });
}

describe('CreatorProfile certificate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreator({});
  });

  it('reads the profile for its username and opens links in a new tab', async () => {
    const user = userEvent.setup();
    const { container } = render(<CreatorProfile username='sample-artist' />);

    expect(useCreator).toHaveBeenCalledWith('sample-artist');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Sample Artist' })
    ).toBeInTheDocument();
    expect(screen.getByText('Producer and DJ.')).toBeInTheDocument();

    await user.tab();
    const anchor = screen.getByRole('link', { name: 'Link 1' });
    expect(anchor).toHaveFocus();
    expect(anchor).toHaveAttribute('href', 'https://instagram.com/sample-1');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    await expectNoA11yViolations(container);
  });

  it('renders the loading skeleton without profile content', async () => {
    mockCreator({ creator: null, loading: true });
    const { container } = render(<CreatorProfile username='sample-artist' />);

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/Failed to load/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the error card when the read fails or finds nothing', async () => {
    mockCreator({ creator: null, error: new Error('Failed to fetch') });
    const { container, rerender } = render(
      <CreatorProfile username='sample-artist' />
    );
    expect(
      screen.getByText(
        'Failed to load creator profile. Please try again later.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    mockCreator({ creator: null });
    rerender(<CreatorProfile username='missing' />);
    expect(
      screen.getByText(/Failed to load creator profile/)
    ).toBeInTheDocument();
  });

  it('falls back to the username and hides empty bio and links', async () => {
    mockCreator({
      creator: { ...creator, displayName: null, bio: null, socialLinks: [] },
    });
    const { container } = render(<CreatorProfile username='sample-artist' />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'sample-artist' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Latest Release')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('drops inactive links, caps the rest and falls back to the platform name', async () => {
    mockCreator({
      creator: {
        ...creator,
        socialLinks: [
          link(0, { isActive: false, displayText: 'Hidden' }),
          link(1, { displayText: null, platform: 'tiktok' }),
          ...Array.from({ length: 8 }, (_, i) => link(i + 2)),
        ],
      },
    });
    const { container } = render(<CreatorProfile username='sample-artist' />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(screen.queryByRole('link', { name: 'Hidden' })).toBeNull();
    expect(links[0]).toHaveTextContent('tiktok');
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left copy whole', async () => {
    const bio =
      'Producer, DJ and label owner touring every summer and releasing a new single every month.';
    mockCreator({ creator: { ...creator, displayName: 'فنان تجريبي', bio } });
    const { container } = render(
      <div dir='rtl'>
        <CreatorProfile username='sample-artist' />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'فنان تجريبي' })
    ).toBeInTheDocument();
    expect(screen.getByText(bio)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
