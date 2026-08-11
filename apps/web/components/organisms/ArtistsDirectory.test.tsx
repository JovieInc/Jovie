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
    ).toEqual(['/images/avatars/tim-white-founder.jpg']);
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
});
