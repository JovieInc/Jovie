import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LaunchPage from '@/app/(marketing)/launch/page';

describe('LaunchPage audience surface', () => {
  it('keeps the hero headline complete and balanced', () => {
    render(<LaunchPage />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Your entire music career. One intelligent link.',
    });

    expect(heading).toHaveClass('system-b-launch-hero-title', 'text-balance');
    expect(heading).toHaveClass('marketing-h1-max-two-lines');
    expect(screen.getByText('7M')).toHaveClass('tabular-nums');
  });

  it('exposes the audience table overflow region to keyboard scrolling', () => {
    render(<LaunchPage />);

    const audienceRegion = screen.getByRole('region', {
      name: 'Audience Table',
    });

    expect(audienceRegion).toHaveAttribute('tabindex', '0');
    expect(audienceRegion.querySelector('table')).toBeInTheDocument();
  });
});
