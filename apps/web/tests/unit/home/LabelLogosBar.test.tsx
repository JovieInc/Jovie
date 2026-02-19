import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LabelLogosBar } from '@/components/home/LabelLogosBar';

describe('LabelLogosBar', () => {
  it('renders all label logos', () => {
    render(<LabelLogosBar />);
    expect(screen.getByLabelText('Sony Music')).toBeInTheDocument();
    expect(screen.getByLabelText('Universal Music Group')).toBeInTheDocument();
    expect(screen.getByLabelText('AWAL')).toBeInTheDocument();
    expect(screen.getByLabelText('Armada Music')).toBeInTheDocument();
  });

  it('renders section with proper aria-label', () => {
    render(<LabelLogosBar />);
    expect(
      screen.getByRole('region', { name: /record labels/i })
    ).toBeInTheDocument();
  });

  it('renders heading text', () => {
    render(<LabelLogosBar />);
    expect(screen.getByText(/trusted by artists on/i)).toBeInTheDocument();
  });
});
