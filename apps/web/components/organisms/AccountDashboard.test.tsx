import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccountDashboard } from './AccountDashboard';

describe('AccountDashboard', () => {
  it('renders the account settings quick actions and support links', () => {
    render(<AccountDashboard />);

    expect(
      screen.getByRole('heading', { name: 'Account Settings' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Manage Billing' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit Profile' })).toHaveAttribute(
      'href',
      '/app/settings/profile'
    );
    expect(
      screen.getByRole('link', { name: 'View Settings' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Contact Support' })
    ).toHaveAttribute('href', '/support');
  });

  it('deep-links View Documentation to the docs index', () => {
    render(<AccountDashboard />);

    const docsLink = screen.getByRole('link', { name: 'View Documentation' });
    expect(docsLink).toHaveAttribute('href', 'https://docs.jov.ie/docs');
    expect(docsLink).toHaveAttribute('target', '_blank');
    expect(docsLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders its section titles as h2 headings, not skipped h3/h4 levels', () => {
    render(<AccountDashboard />);

    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(screen.queryAllByRole('heading', { level: 4 })).toHaveLength(0);
    expect(
      screen.getAllByRole('heading', { level: 2 }).length
    ).toBeGreaterThanOrEqual(2);
  });
});
