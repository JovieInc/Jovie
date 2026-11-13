import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_FEATURED_ARTIST, isDemoArtist } from '@/data/demoArtists';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomepageProfilePhone } from './HomepageProfilePhone';

const ARTIST = HOMEPAGE_FEATURED_ARTIST;
const LATEST = ARTIST.releases[0];

describe('HomepageProfilePhone', () => {
  it('draws the featured artist with the latest release as the one thing', async () => {
    const { container } = render(
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
    await expectNoA11yViolations(container);
  });

  it('exposes one labelled image for a long or right-to-left release', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomepageProfilePhone
          alt='ملف فنان تجريبي على جوفي.'
          release={{
            title: 'ليالي القاهرة · إصدار خاص بمناسبة الذكرى العاشرة',
            src: LATEST.src,
          }}
        />
      </div>
    );
    const phone = screen.getByRole('img', {
      name: 'ملف فنان تجريبي على جوفي.',
    });
    expect(phone).toHaveTextContent('ليالي القاهرة');
    await expectNoA11yViolations(container);
  });

  it('draws the featured artist from the slot, Tim for now, with no verified badge', () => {
    expect(isDemoArtist(ARTIST)).toBe(false);
    render(
      <HomepageProfilePhone
        alt='Tim White’s Jovie profile.'
        release={{ title: LATEST.title, src: LATEST.src }}
      />
    );
    const phone = screen.getByRole('img');
    expect(phone).toHaveTextContent('Tim White');
    expect(phone).toHaveTextContent('jov.ie/tim');
    expect(phone).toHaveTextContent('Never Say A Word');
    expect(phone.querySelector('.hv3-pp__badge')).toBeNull();
  });
});
