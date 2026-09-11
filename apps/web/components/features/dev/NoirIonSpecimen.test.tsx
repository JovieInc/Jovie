import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoirIonSpecimen } from './NoirIonSpecimen';

describe('NoirIonSpecimen', () => {
  it('renders the dark palette specimen with bounded table headers', () => {
    render(<NoirIonSpecimen />);

    expect(screen.getByTestId('noir-ion-specimen')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Jovie Noir Ion' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Primary Action' })
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'State' })).toHaveClass(
      'whitespace-nowrap'
    );
    expect(screen.getByText('Canvas')).toBeInTheDocument();
    expect(screen.getByText('Shell')).toBeInTheDocument();
    expect(screen.getByText('Card')).toBeInTheDocument();
    expect(screen.getByText('Elevated')).toBeInTheDocument();
    expect(screen.getByText('Floating')).toBeInTheDocument();
    expect(screen.queryByText('Panel')).not.toBeInTheDocument();
    expect(screen.getByText('Mint')).toBeInTheDocument();
    expect(screen.getByText('Orange')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Success (aqua aliases mint)')).toBeInTheDocument();
    expect(
      screen.getByText('Warning (gold aliases orange)')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Danger / error (flare aliases red)')
    ).toBeInTheDocument();
    expect(screen.queryByText('Aqua')).not.toBeInTheDocument();
    expect(screen.queryByText('Gold')).not.toBeInTheDocument();
    expect(screen.queryByText('Flare')).not.toBeInTheDocument();
    expect(screen.getByText('Ion focus ring')).toBeInTheDocument();
  });
});
