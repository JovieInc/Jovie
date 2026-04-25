import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt = '', ...props }: ComponentProps<'img'>) => (
    <img alt={alt} {...props} />
  ),
}));

import { HomeTrustSection } from '@/components/features/home/HomeTrustSection';

describe('HomeTrustSection', () => {
  it('renders the boxed card presentation by default', () => {
    render(<HomeTrustSection />);

    expect(screen.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'card'
    );
    expect(screen.getByText('Trusted by artists on')).toBeInTheDocument();
    expect(screen.getByLabelText('Universal Music Group')).toBeInTheDocument();
    expect(screen.getByLabelText('AWAL')).toBeInTheDocument();
  });

  it('renders the homepage inline strip presentation when requested', () => {
    render(
      <HomeTrustSection
        presentation='inline-strip'
        label='Trusted by artists'
      />
    );

    expect(screen.getByTestId('homepage-trust')).toHaveAttribute(
      'data-presentation',
      'inline-strip'
    );
    expect(screen.getByText('Trusted by artists')).toBeInTheDocument();
    expect(screen.getByAltText('Black Hole Recordings')).toBeInTheDocument();
    expect(screen.getByLabelText('disco:wax')).toBeInTheDocument();
  });
});
