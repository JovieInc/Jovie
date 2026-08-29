import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DevelopersPage from './page';

describe('DevelopersPage', () => {
  it('renders the public artist API quickstart and machine-readable resources', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByRole('heading', { name: 'Public artist data, in the open.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('curl https://jov.ie/api/v1/{username}')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Read the OpenAPI contract' })
    ).toHaveAttribute('href', '/openapi.json');
    expect(screen.getByRole('link', { name: 'llms.txt' })).toHaveAttribute(
      'href',
      '/llms.txt'
    );
    expect(screen.getByRole('link', { name: 'llms-full.txt' })).toHaveAttribute(
      'href',
      '/llms-full.txt'
    );
  });

  it('states the public API boundary without promising writes or credentials', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByText(
        /anonymous GET access to data an artist has made public/i
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not add a write API, credentials/i)
    ).toBeInTheDocument();
  });
});
