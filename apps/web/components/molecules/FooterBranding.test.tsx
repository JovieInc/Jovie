import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FooterBranding } from './FooterBranding';

describe('FooterBranding', () => {
  it('names the text mark from its visible copy plus a Home hint', () => {
    render(<FooterBranding mark='text' showCTA={false} />);
    const link = screen.getByRole('link', { name: /^Powered by\s*Jovie\s*Home$/ });
    expect(link).not.toHaveAttribute('aria-label');
    expect(screen.getByText('Home')).toHaveClass('sr-only');
  });

  it('labels the icon mark and adds UTM params when an artist is known', () => {
    render(<FooterBranding artistHandle='tim' />);
    expect(screen.getByRole('link', { name: 'Jovie Home' })).toHaveAttribute(
      'href',
      '/?utm_source=profile&utm_artist=tim'
    );
    expect(
      screen.getByRole('link', { name: 'Join the waitlist' })
    ).toHaveAttribute('href', '/waitlist?utm_source=profile&utm_artist=tim');
  });
});
