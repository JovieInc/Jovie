import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageV2FinalCta } from '@/components/marketing/homepage-v2/HomepageV2Route';

describe('HomepageV2FinalCta', () => {
  it('renders the static CTA contract with the image background', () => {
    render(<HomepageV2FinalCta />);

    expect(screen.getByTestId('homepage-v2-final-cta')).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-v2-final-cta-heading')
    ).toHaveTextContent(/Start using Jovie\s*today for free\./);
    expect(
      screen.getByTestId('homepage-v2-final-cta-primary')
    ).toBeInTheDocument();

    const background = screen.getByTestId('homepage-v2-final-cta-background');
    expect(background.tagName).toBe('IMG');
    expect(background.getAttribute('src')).toContain('footer-cta-bg.png');
    expect(background).toHaveAttribute('alt', '');
  });
});
