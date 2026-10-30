import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialProofSection } from './SocialProofSection';

describe('SocialProofSection', () => {
  it('renders founder credibility and launch-stage positioning copy', () => {
    render(<SocialProofSection />);

    expect(screen.getByText('Built by a musician')).toHaveClass('uppercase');
    expect(screen.getByText('Tim White')).toHaveClass('text-primary-token');
    expect(
      screen.getByText(/Sony, Universal, AWAL, and Armada/)
    ).toBeInTheDocument();
    expect(
      screen.getByText('Built for independent artists')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Be early. Claim your handle before your next release.')
    ).toBeInTheDocument();
  });
});
