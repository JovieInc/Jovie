import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { StaticArtistPage } from './StaticArtistPage';

vi.mock('@/features/profile/templates/ProfileCompactTemplate', () => ({
  ProfileCompactTemplate: ({
    catalogLoadFailed,
  }: {
    readonly catalogLoadFailed?: boolean;
  }) => (
    <div
      data-testid='mock-compact-template'
      data-catalog-load-failed={catalogLoadFailed ? 'true' : 'false'}
    />
  ),
}));

describe('StaticArtistPage', () => {
  it('forwards catalog load failure instead of an empty catalog', () => {
    render(
      <StaticArtistPage
        mode='listen'
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[]}
        contacts={[]}
        subtitle='Artist profile'
        showBackButton={false}
        catalogLoadFailed
        releases={[]}
      />
    );

    expect(screen.getByTestId('mock-compact-template')).toHaveAttribute(
      'data-catalog-load-failed',
      'true'
    );
  });
});
