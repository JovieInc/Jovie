import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NewFeaturesSection } from './NewFeaturesSection';

describe('NewFeaturesSection', () => {
  it('renders bounded feature headline, outcomes, and details disclosure', () => {
    render(<NewFeaturesSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /Sharable profile built to convert/i,
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText('Higher conversion')).toBeInTheDocument();
    expect(screen.getByText('Owned audience')).toBeInTheDocument();
    expect(screen.getByText('Optimization over time')).toBeInTheDocument();
    expect(screen.getByText('More details')).toBeInTheDocument();
  });
});
