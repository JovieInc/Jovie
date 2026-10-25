import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OvieQuietList } from './OvieQuietList';

describe('OvieQuietList', () => {
  it('renders one line per row: primary text and a quiet secondary', () => {
    render(
      <OvieQuietList
        testId='list'
        rows={[
          {
            id: 'a',
            primary: 'Keep the status feed under the cap',
            secondary: '#23098',
          },
          { id: 'b', primary: 'Retain typed email' },
        ]}
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Keep the status feed under the cap');
    expect(items[0]).toHaveTextContent('#23098');
    expect(items[1]).not.toHaveTextContent('#');
    expect(screen.getByText('#23098')).toHaveClass(
      'text-xs',
      'text-tertiary-token'
    );
  });
  it('shows a quiet "+N more" only when there is more', () => {
    const { rerender } = render(
      <OvieQuietList rows={[]} more={84} moreLabel='merges' />
    );
    expect(screen.getByTestId('ovie-quiet-more')).toHaveTextContent(
      '+84 merges'
    );
    expect(screen.getByTestId('ovie-quiet-more')).toHaveClass(
      'text-xs',
      'text-tertiary-token'
    );
    rerender(<OvieQuietList rows={[]} more={0} />);
    expect(screen.queryByTestId('ovie-quiet-more')).toBeNull();
  });
  it('marks attention rows and links rows that have a destination', () => {
    render(
      <OvieQuietList
        rows={[
          { id: 'a', primary: 'Failing check', attention: true, href: '/x' },
        ]}
      />
    );
    expect(screen.getByRole('listitem')).toHaveAttribute(
      'data-attention',
      'true'
    );
    expect(screen.getByRole('link', { name: 'Failing check' })).toHaveAttribute(
      'href',
      '/x'
    );
  });
});
