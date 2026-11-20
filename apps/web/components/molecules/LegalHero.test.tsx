import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalHero } from './LegalHero';

describe('LegalHero', () => {
  it('renders the title, date and summary on semantic tokens', () => {
    render(
      <LegalHero
        title='Privacy Policy'
        lastUpdated='February 2026'
        practicalSummary='We collect only what is essential.'
      />
    );

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Privacy Policy',
    });
    expect(heading).toHaveClass('text-primary-token', 'text-balance');
    expect(screen.getByText('Last updated: February 2026')).toHaveClass(
      'text-tertiary-token'
    );
    expect(screen.getByText('We collect only what is essential.')).toHaveClass(
      'text-secondary-token'
    );
    expect(heading.closest('header')?.className ?? '').not.toMatch(
      /neutral-|white\//
    );
  });

  it('omits the date line when the document has none', () => {
    render(
      <LegalHero
        title='DMCA Policy'
        lastUpdated=''
        practicalSummary='Notice.'
      />
    );
    expect(screen.queryByText(/Last updated/)).not.toBeInTheDocument();
  });
});
