import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GroupHeader } from '../atoms/GroupHeader';
import { GroupedTableBody } from './GroupedTableBody';

const groups = [
  {
    key: 'first',
    label: 'First',
    count: 2,
    rows: [
      { id: 'a', name: 'Ada' },
      { id: 'c', name: 'Cy' },
    ],
  },
  { key: 'second', label: 'Second', count: 1, rows: [{ id: 'b', name: 'Bo' }] },
];

describe('shared grouped table rendering', () => {
  it('keeps rendered row indices and registered headers aligned with displayed groups as the header height changes', () => {
    const observeGroupHeader = vi.fn();
    const body = (stickyOffset: number) => (
      <table>
        <GroupedTableBody
          groupedData={groups}
          columns={1}
          stickyOffset={stickyOffset}
          observeGroupHeader={observeGroupHeader}
          renderRow={(row, index) => (
            <tr key={row.id}>
              <td>
                {index}: {row.name}
              </td>
            </tr>
          )}
        />
      </table>
    );
    const { rerender } = render(body(88));
    const first = screen.getByRole('row', { name: 'First (2)' });
    const second = screen.getByRole('row', { name: 'Second (1)' });
    expect(observeGroupHeader).toHaveBeenCalledWith('first', first);
    expect(observeGroupHeader).toHaveBeenCalledWith('second', second);
    expect(screen.getAllByRole('row').map(row => row.textContent)).toEqual([
      'First (2)',
      '0: Ada',
      '1: Cy',
      'Second (1)',
      '2: Bo',
    ]);
    expect(first).toHaveStyle({ top: '88px' });
    expect(second).toHaveStyle({ top: '88px' });
    rerender(body(104));
    expect(screen.getByRole('row', { name: 'First (2)' })).toBe(first);
    expect(first).toHaveStyle({ top: '104px' });
    expect(second).toHaveStyle({ top: '104px' });
  });

  it('uses the measured header offset only for sticky group headers', () => {
    const { rerender } = render(
      <table>
        <tbody>
          <GroupHeader
            label='First'
            count={2}
            colSpan={3}
            stickyOffset={88}
            isSticky
          />
        </tbody>
      </table>
    );
    const row = screen.getByRole('row', { name: 'First (2)' });
    expect(row).toHaveStyle({ top: '88px' });
    expect(screen.getByRole('cell', { name: 'First (2)' })).toHaveAttribute(
      'colspan',
      '3'
    );
    rerender(
      <table>
        <tbody>
          <GroupHeader
            label='First'
            count={2}
            colSpan={3}
            stickyOffset={88}
            isSticky={false}
          />
        </tbody>
      </table>
    );
    expect(row.style.top).toBe('');
  });
});
