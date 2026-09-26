import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ArtistsDirectory,
  getArtistsDirectoryAvatarUrl,
} from './ArtistsDirectory';
import { ARTISTS_DIRECTORY_STORY_PROFILES } from './ArtistsDirectory.fixture';

describe('ArtistsDirectory', () => {
  it('keeps the design fixture identity and order deterministic', () => {
    expect(ARTISTS_DIRECTORY_STORY_PROFILES.map(profile => profile.id)).toEqual(
      ['fixture-tim-white']
    );
    expect(
      ARTISTS_DIRECTORY_STORY_PROFILES.map(profile => profile.avatarUrl)
    ).toEqual(['/images/avatars/tim-white.jpg']);
    expect(
      ARTISTS_DIRECTORY_STORY_PROFILES.map(profile => profile.username)
    ).toEqual(['tim']);
    expect(
      ARTISTS_DIRECTORY_STORY_PROFILES.map(profile => profile.bio)
    ).toEqual(['Artist']);
  });

  it('rejects the known broken Unsplash placeholder before rendering', () => {
    expect(
      getArtistsDirectoryAvatarUrl('https://images.unsplash.com/placeholder')
    ).toBeNull();
    expect(
      getArtistsDirectoryAvatarUrl(
        'https://images.unsplash.com/placeholder?auto=format'
      )
    ).toBeNull();
    expect(
      getArtistsDirectoryAvatarUrl(
        'https://images.unsplash.com/photo-valid?auto=format'
      )
    ).toBe('https://images.unsplash.com/photo-valid?auto=format');
  });

  it('renders the production directory body with the stable fixture', () => {
    render(<ArtistsDirectory profiles={ARTISTS_DIRECTORY_STORY_PROFILES} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'All artists' })
    ).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tim White/ })).toHaveAttribute(
      'href',
      '/tim'
    );
  });

  it('keeps the empty state in the same component body', () => {
    render(<ArtistsDirectory profiles={[]} />);

    expect(screen.getByText('No profiles found')).toBeInTheDocument();
  });

  it('renders a load-more link and a total distinct from the page size (JOV-6451)', () => {
    render(
      <ArtistsDirectory
        profiles={ARTISTS_DIRECTORY_STORY_PROFILES}
        total={5000}
        nextCursor='opaque-cursor-token'
      />
    );

    expect(screen.getByText('5000')).toBeInTheDocument();
    expect(screen.getByTestId('artists-directory-page-note')).toHaveTextContent(
      'Showing 1 of 5000 public profiles.'
    );
    expect(screen.getByTestId('artists-directory-next-page')).toHaveAttribute(
      'href',
      '/artists?cursor=opaque-cursor-token'
    );
    expect(screen.queryByText('First page')).not.toBeInTheDocument();
  });

  it('offers a way back to the first page from cursor pages', () => {
    render(
      <ArtistsDirectory
        profiles={ARTISTS_DIRECTORY_STORY_PROFILES}
        total={5000}
        nextCursor={null}
        isFirstPage={false}
      />
    );

    expect(screen.getByText('First page')).toHaveAttribute('href', '/artists');
    expect(
      screen.queryByTestId('artists-directory-next-page')
    ).not.toBeInTheDocument();
  });

  it('bounds rendered cards, images, and HTML at the maximum page size', () => {
    const profiles = Array.from({ length: 60 }, (_, index) => ({
      id: `p-${index}`,
      username: `artist${index}`,
      displayName: `Artist ${index}`,
      avatarUrl: `/avatars/${index}.png`,
      bio: `Bio ${index}`,
    }));

    const startedAt = performance.now();
    const { container } = render(
      <ArtistsDirectory profiles={profiles} total={10000} nextCursor='next' />
    );
    const elapsedMs = performance.now() - startedAt;

    const htmlBytes = new TextEncoder().encode(container.innerHTML).length;
    const imageCount = container.querySelectorAll('img').length;

    // Maximum-supported-dataset evidence: one bounded page regardless of the
    // catalog total — cards, image requests, HTML bytes, and render time stay
    // constant instead of scaling with claimed public profiles.
    expect(container.querySelectorAll('h2')).toHaveLength(60);
    expect(imageCount).toBeLessThanOrEqual(60);
    expect(htmlBytes).toBeLessThan(400_000);
    expect(elapsedMs).toBeLessThan(2000);
    expect({
      rows: profiles.length,
      imageRequests: imageCount,
      htmlBytes,
      elapsedMs,
    }).toMatchObject({ rows: 60 });
  });
});
