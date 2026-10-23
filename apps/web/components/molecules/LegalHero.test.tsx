import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalHero } from './LegalHero';

describe('LegalHero', () => {
  it('shows the document identity and summary with an optional update date', () => {
    const { rerender } = render(
      <LegalHero
        title='Privacy policy'
        lastUpdated='October 15, 2026'
        practicalSummary='How we handle account data.'
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Privacy policy' })
    ).toBeVisible();
    expect(screen.getByText('How we handle account data.')).toBeVisible();
    expect(screen.getByText('Last updated: October 15, 2026')).toBeVisible();

    rerender(
      <LegalHero
        title='Terms of service'
        lastUpdated=''
        practicalSummary='The terms for using Jovie.'
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of service' })
    ).toBeVisible();
    expect(screen.getByText('The terms for using Jovie.')).toBeVisible();
    expect(screen.queryByText(/Last updated:/)).not.toBeInTheDocument();
  });
});
