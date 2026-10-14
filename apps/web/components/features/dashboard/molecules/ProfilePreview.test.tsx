import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProfilePreview } from './ProfilePreview';

vi.mock('@/features/profile/StaticArtistPage', () => ({
  StaticArtistPage: ({ artist }: { artist: { is_verified: boolean } }) => (
    <output aria-label='Preview verification'>
      {String(artist.is_verified)}
    </output>
  ),
}));

it.each([undefined, false, true])(
  'forwards source verification %s to the public preview',
  isVerified => {
    render(
      <ProfilePreview
        username='alex'
        displayName='Alex Rivera'
        links={[]}
        isVerified={isVerified}
      />
    );
    expect(screen.getByLabelText('Preview verification')).toHaveTextContent(
      String(isVerified === true)
    );
  }
);
