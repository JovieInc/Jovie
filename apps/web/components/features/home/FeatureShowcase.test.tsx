import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureShowcase } from './FeatureShowcase';

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
  }: Readonly<{
    alt: string;
    src: string;
  }>) => <img alt={alt} src={src} />,
}));

describe('FeatureShowcase', () => {
  it('renders the platform section with feature card receipts', () => {
    render(<FeatureShowcase />);

    expect(screen.getByText('The platform')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Everything Your Music Needs.',
      })
    ).toHaveClass('line-clamp-2');

    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Release day, automated.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Know every fan by name.',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(
      screen.getByText('Smart links generated automatically for every release')
    ).toBeInTheDocument();
    expect(
      screen.getByAltText(
        'Jovie release dashboard showing releases table with smart link details'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByAltText(
        'Jovie audience CRM showing fan contacts with source tracking'
      )
    ).toBeInTheDocument();
  });
});
