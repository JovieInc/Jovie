import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';
import { ProfilePreview } from './ProfilePreview';

const spotify = {
  id: 'spotify',
  title: 'Spotify',
  platform: 'spotify',
  url: 'https://open.spotify.com/artist/sashawaves',
  isVisible: true,
};

describe('ProfilePreview certificate', () => {
  it('renders the public preview with the display name', async () => {
    const { container } = renderWithQueryClient(
      <ProfilePreview
        username='sashawaves'
        displayName='Sasha Waves'
        links={[spotify]}
        className='preview-frame'
      />
    );

    expect(container.firstElementChild).toHaveClass('preview-frame');
    expect(screen.getAllByText('Sasha Waves').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('falls back to the handle when the display name is blank', async () => {
    const { container } = renderWithQueryClient(
      <ProfilePreview username='sashawaves' displayName='   ' links={[]} />
    );

    expect(screen.getAllByText('sashawaves').length).toBeGreaterThan(0);
    expect(screen.queryByText('Sasha Waves')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a verified profile with a long name and many links accessible', async () => {
    const name = 'Sasha Waves and the Midnight Harbour Orchestra Collective';
    const { container } = renderWithQueryClient(
      <ProfilePreview
        username='sashawaves'
        displayName={name}
        isVerified
        avatarUrl='/avatars/default-user.png'
        links={[
          spotify,
          {
            id: 'apple',
            title: 'Apple Music',
            platform: 'apple_music',
            url: 'https://music.apple.com/artist/sashawaves',
            isVisible: true,
          },
          {
            id: 'youtube',
            title: 'YouTube',
            platform: 'youtube',
            url: 'https://youtube.com/@sashawaves',
            isVisible: true,
          },
        ]}
      />
    );

    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = renderWithQueryClient(
      <div dir='rtl'>
        <ProfilePreview
          username='sashawaves'
          displayName='ساشا ويفز'
          links={[spotify]}
        />
      </div>
    );

    expect(screen.getAllByText('ساشا ويفز').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
