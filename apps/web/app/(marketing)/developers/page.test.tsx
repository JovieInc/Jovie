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

  it('renders the agent quickstart with verified public surfaces only', () => {
    render(<DevelopersPage />);

    expect(
      screen.getByRole('heading', { name: 'Agent quickstart' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jovie CLI' })).toHaveAttribute(
      'href',
      '/cli'
    );

    const quickstart = screen
      .getByRole('heading', { name: 'Agent quickstart' })
      .closest('section');
    expect(quickstart).toHaveTextContent(
      'this read-only API, the read-only Jovie CLI, and per-artist MCP endpoints'
    );
    expect(quickstart).toHaveTextContent('https://jov.ie/api/mcp/{username}');
  });

  it('states the real read/write scope from the actual contracts', () => {
    render(<DevelopersPage />);

    const quickstart = screen
      .getByRole('heading', { name: 'Agent quickstart' })
      .closest('section');
    expect(quickstart).toHaveTextContent(/are read-only/i);
    expect(quickstart).toHaveTextContent(
      /require authenticated profile ownership plus explicit confirmation/i
    );
    expect(quickstart).toHaveTextContent(
      /No credential, key, or developer account is needed/i
    );
  });

  it('documents limits and error behavior from the API contract', () => {
    render(<DevelopersPage />);

    const quickstart = screen
      .getByRole('heading', { name: 'Agent quickstart' })
      .closest('section');
    expect(quickstart).toHaveTextContent(/100 per client IP/i);
    expect(quickstart).toHaveTextContent(/60-second window/i);
    expect(quickstart).toHaveTextContent('429');
    expect(quickstart).toHaveTextContent('503');
    expect(quickstart).toHaveTextContent('404');
    expect(quickstart).toHaveTextContent(/Only GET is supported/i);
  });
});
