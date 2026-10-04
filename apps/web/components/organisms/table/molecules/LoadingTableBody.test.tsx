import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingTableBody } from './LoadingTableBody';

describe('LoadingTableBody', () => {
  it('renders the requested rows with one cell per column', () => {
    const { container } = render(
      <table>
        <LoadingTableBody rows={3} columns={2} rowHeight='32px' />
      </table>
    );

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.querySelectorAll('td')).toHaveLength(2);
      expect(row).toHaveStyle({ height: '32px' });
    }
  });

  it('paints the people-row skeleton for a person column', () => {
    const { container } = render(
      <table>
        <LoadingTableBody
          rows={1}
          columns={2}
          columnConfig={[{ variant: 'person', width: '160px' }, {}]}
        />
      </table>
    );

    const [personCell, textCell] = container.querySelectorAll('td');
    expect(
      personCell.querySelector('.system-b-table-skeleton-person-face')
    ).not.toBeNull();
    expect(
      textCell.querySelector('.system-b-table-skeleton-person-face')
    ).toBeNull();
  });
});
