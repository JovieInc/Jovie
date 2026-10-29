import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProofMethodologyPage, { metadata } from './page';

describe('proof methodology page', () => {
  it('renders the registry methodology under one page heading', () => {
    render(<ProofMethodologyPage />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'How Jovie Measures Its Numbers',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'What Each Number Means' })
    ).toBeInTheDocument();
    expect(document.getElementById('accounts_total')).not.toBeNull();
  });

  it('has a canonical URL on the methodology route', () => {
    expect(String(metadata.alternates?.canonical)).toMatch(
      /\/proof\/methodology$/u
    );
  });
});
