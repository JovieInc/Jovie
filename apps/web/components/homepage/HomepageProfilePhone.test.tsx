import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageProfilePhone } from './HomepageProfilePhone';

describe('HomepageProfilePhone', () => {
  it('draws Tim White at jov.ie/tim with the latest release as the one thing', () => {
    render(
      <HomepageProfilePhone
        alt='Tim White’s Jovie profile.'
        release={{
          title: 'Never Say A Word',
          src: '/img/releases/never-say-a-word.jpg',
        }}
      />
    );
    const phone = screen.getByRole('img', {
      name: 'Tim White’s Jovie profile.',
    });
    expect(phone).toHaveTextContent('Tim White');
    expect(phone).toHaveTextContent('jov.ie/tim');
    expect(phone).toHaveTextContent('Never Say A Word');
    expect(phone).toHaveTextContent('Listen now');
  });
});
