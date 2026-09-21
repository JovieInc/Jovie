import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LaunchPage from '@/app/(marketing)/launch/page';

describe('LaunchPage audience surface', () => {
  it('exposes the audience table overflow region to keyboard scrolling', () => {
    render(<LaunchPage />);

    const audienceRegion = screen.getByRole('region', {
      name: 'Audience Table',
    });

    expect(audienceRegion).toHaveAttribute('tabindex', '0');
    expect(audienceRegion.querySelector('table')).toBeInTheDocument();
  });
});
