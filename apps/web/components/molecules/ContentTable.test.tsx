import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContentTable, ContentTableStateRow } from './ContentTable';

describe('ContentTable', () => {
  it('renders the canonical spinner while rows are loading', () => {
    render(
      <ContentTable>
        <tbody>
          <ContentTableStateRow
            colSpan={2}
            isLoading
            emptyMessage='No rows'
            loadingLabel='Loading contacts'
          />
        </tbody>
      </ContentTable>
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toHaveAttribute(
      'data-size',
      'sm'
    );
    expect(screen.getByText('Loading contacts')).toHaveClass('sr-only');
  });

  it('renders the empty message when loading is complete', () => {
    render(
      <ContentTable>
        <tbody>
          <ContentTableStateRow colSpan={2} emptyMessage='No contacts yet' />
        </tbody>
      </ContentTable>
    );

    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
