import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataCard } from './DataCard';

describe('DataCard', () => {
  it('renders title, subtitle, metadata and actions', () => {
    render(
      <DataCard
        title='Release'
        subtitle='Single'
        metadata='Jan 1'
        actions={<button type='button'>Edit</button>}
      />
    );
    expect(screen.getByText('Release')).toHaveAttribute('title', 'Release');
    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByText('Jan 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it.each([
    ['success', 'text-success-text'],
    ['warning', 'text-warning-text'],
    ['error', 'text-error-text'],
  ] as const)(
    'renders the %s badge with the AA text token',
    (variant, token) => {
      render(
        <DataCard title='Release' badge='Status' badgeVariant={variant} />
      );
      expect(screen.getByText('Status')).toHaveClass(token);
    }
  );

  it('omits a blank badge', () => {
    render(<DataCard title='Release' badge='  ' />);
    expect(screen.queryByText('  ')).toBeNull();
    expect(document.querySelector('.rounded-full')).toBeNull();
  });
});
