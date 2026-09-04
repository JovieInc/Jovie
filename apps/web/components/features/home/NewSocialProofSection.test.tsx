import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewSocialProofSection } from './NewSocialProofSection';

describe('NewSocialProofSection', () => {
  it('renders bounded proof headline and conversion positioning copy', () => {
    render(<NewSocialProofSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Beautiful artist profiles Built to convert/i,
      })
    ).toHaveClass('line-clamp-2');
    expect(
      screen.getByText(/Fast load, clear next steps, and a layout built/i)
    ).toHaveClass('text-linear');
    expect(screen.getByText(/tap to listen to follow/i)).toBeInTheDocument();
  });
});
