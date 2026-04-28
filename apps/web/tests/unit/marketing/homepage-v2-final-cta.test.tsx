import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageV2FinalCta } from '@/components/marketing/homepage-v2/HomepageV2Route';

describe('HomepageV2FinalCta', () => {
  it('renders the static CTA contract without a media background', () => {
    const { container } = render(<HomepageV2FinalCta />);

    expect(screen.getByTestId('homepage-v2-final-cta')).toBeInTheDocument();
    expect(
      screen.getByTestId('homepage-v2-final-cta-heading')
    ).toHaveTextContent(/Start using Jovie\s*today for free\./);
    expect(
      screen.getByTestId('homepage-v2-final-cta-primary')
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-v2-final-cta-background')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('homepage-v2-final-cta-video')
    ).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
