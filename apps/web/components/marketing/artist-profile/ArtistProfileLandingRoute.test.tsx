import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ARTIST_PROFILE_COPY } from '@/data/artistProfileCopy';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileLandingRoute } from './ArtistProfileLandingRoute';
import storyMeta from './ArtistProfileLandingRoute.stories';

describe('ArtistProfileLandingRoute', () => {
  it('mounts the landing page inside the artist-profiles page shell', async () => {
    const { container } = render(
      <ArtistProfileLandingRoute {...storyMeta.args} />
    );
    expect(
      container.querySelector('.artist-profiles-home-system')
    ).not.toBeNull();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: ARTIST_PROFILE_COPY.hero.headline,
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('keeps the mounted mode switcher interactive', async () => {
    const user = userEvent.setup();
    render(<ArtistProfileLandingRoute {...storyMeta.args} />);
    const mode = ARTIST_PROFILE_COPY.adaptive.modes[1];
    const [tab] = screen.getAllByRole('tab', { name: mode.label });
    await user.click(tab);
    expect(tab).toHaveAttribute('aria-selected', 'true');
  });
});
