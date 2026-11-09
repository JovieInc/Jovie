import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_FEATURED_ARTIST, isDemoArtist } from '@/data/demoArtists';
import { HomepageProfilePhone } from './HomepageProfilePhone';

const ARTIST = HOMEPAGE_FEATURED_ARTIST;
const LATEST = ARTIST.releases[0];

describe('HomepageProfilePhone', () => {
  it('draws the featured artist with the latest release as the one thing', () => {
    render(
      <HomepageProfilePhone
        alt='An example artist’s Jovie profile.'
        release={{ title: LATEST.title, src: LATEST.src }}
      />
    );
    const phone = screen.getByRole('img', {
      name: 'An example artist’s Jovie profile.',
    });
    expect(phone).toHaveTextContent(ARTIST.name);
    expect(phone).toHaveTextContent(ARTIST.profileDisplay);
    expect(phone).toHaveTextContent(LATEST.title);
    expect(phone).toHaveTextContent('Listen now');
  });

  it('never features Tim on the homepage while the slot is a demo artist', () => {
    expect(isDemoArtist(ARTIST)).toBe(true);
    render(
      <HomepageProfilePhone
        alt='An example artist’s Jovie profile.'
        release={{ title: LATEST.title, src: LATEST.src }}
      />
    );
    const phone = screen.getByRole('img');
    expect(phone).not.toHaveTextContent('Tim White');
    expect(phone).not.toHaveTextContent('jov.ie/tim');
    expect(phone.innerHTML).not.toContain('tim-white');
    // A demo slot is labeled as an example. It does not wear a verified badge.
    expect(ARTIST.name).toBe('Example artist');
    expect(phone.querySelector('.hv3-pp__badge')).toBeNull();
  });
});
