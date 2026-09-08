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
  });
});
