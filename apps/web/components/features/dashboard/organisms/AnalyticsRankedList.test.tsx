import { fireEvent, render, screen } from '@testing-library/react';
import { Globe } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsRankedList, formatRankedLabel } from './AnalyticsRankedList';

describe('AnalyticsRankedList', () => {
  it('ranks items in order with decoded labels', () => {
    render(
      <AnalyticsRankedList
        icon={Globe}
        loading={false}
        emptyMessage='No source data yet'
        items={[
          { key: 'ig', label: 'Instagram', value: '42' },
          { key: 'sp', label: 'S%C3%A3o%20Paulo', value: '7' },
        ]}
      />
    );

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('1Instagram42');
    expect(rows[1]).toHaveTextContent('2São Paulo7');
    // Rank digits right-align in a fixed tabular column.
    expect(screen.getByText('1')).toHaveClass(
      'w-4',
      'text-right',
      'tabular-nums'
    );
  });

  it('keeps one height across loading, empty and loaded states', () => {
    const { container, rerender } = render(
      <AnalyticsRankedList
        icon={Globe}
        loading
        emptyMessage='No source data yet'
        items={[]}
      />
    );
    expect(container.firstElementChild).toHaveClass('min-h-49');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    rerender(
      <AnalyticsRankedList
        icon={Globe}
        loading={false}
        emptyMessage='No source data yet'
        items={[]}
      />
    );
    expect(container.firstElementChild).toHaveClass('min-h-49');
    expect(screen.getByText('No source data yet')).toBeInTheDocument();
  });

  it('draws the designed empty anatomy at the same height when given one', () => {
    const onClick = vi.fn();
    const { container } = render(
      <AnalyticsRankedList
        icon={Globe}
        loading={false}
        emptyMessage='No City Data Yet'
        emptyState={{
          description: 'Cities appear as visitors open your profile.',
          action: { label: 'View Countries', onClick },
        }}
        items={[]}
      />
    );

    expect(container.firstElementChild).toHaveClass('min-h-49');
    expect(
      screen.getByRole('heading', { name: 'No City Data Yet' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cities appear as visitors open your profile.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Countries' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('falls back to the raw label when it is not valid URI encoding', () => {
    expect(formatRankedLabel('100%')).toBe('100%');
  });
});
