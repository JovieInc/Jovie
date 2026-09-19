import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import AlternativesIndexPage from './page';

describe('AlternativesIndexPage', () => {
  it('renders the alternatives hub heading and links to published alternatives', () => {
    render(<AlternativesIndexPage />);

    expect(
      screen.getByRole('heading', { name: 'Alternatives For Musicians' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Linktree' })).toHaveAttribute(
      'href',
      `${APP_ROUTES.ALTERNATIVES}/linktree`
    );
    expect(screen.getByRole('link', { name: 'Link in Bio' })).toHaveAttribute(
      'href',
      `${APP_ROUTES.ALTERNATIVES}/link-in-bio`
    );
  });
});
