import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it('applies a schema column class to the matching skeleton cell', () => {
    const { container } = render(
      <table>
        <LoadingTableBody
          rows={1}
          columns={2}
          columnConfig={[
            { variant: 'text', className: 'schema-name-col' },
            { variant: 'text' },
          ]}
        />
      </table>
    );

    const [nameCell, otherCell] = container.querySelectorAll('td');
    expect(nameCell).toHaveClass('schema-name-col');
    expect(otherCell).not.toHaveClass('schema-name-col');
  });

  it('keeps the same row nodes when the column config arrives', () => {
    const { container, rerender } = render(
      <table>
        <LoadingTableBody rows={2} columns={2} />
      </table>
    );
    const [firstRow] = container.querySelectorAll('tbody tr');
    rerender(
      <table>
        <LoadingTableBody
          rows={2}
          columns={2}
          columnConfig={[{ variant: 'person' }]}
        />
      </table>
    );
    expect(container.querySelector('tbody tr')).toBe(firstRow);
    expect(
      firstRow.querySelector('.system-b-table-skeleton-person-face')
    ).not.toBeNull();
  });

  it.each([
    ['ltr', undefined],
    ['rtl', 'rtl'],
  ] as const)('has no accessibility violations in %s', async (_name, dir) => {
    const { container } = render(
      <table dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
        <caption>Loading audience</caption>
        <LoadingTableBody
          rows={3}
          columns={3}
          columnConfig={[
            { variant: 'person' },
            { variant: 'badge' },
            { variant: 'text' },
          ]}
        />
      </table>
    );
    await expectNoA11yViolations(container);
  });
});
