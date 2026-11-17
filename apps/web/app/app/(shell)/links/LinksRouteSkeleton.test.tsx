import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LINKS_TABLE_HEADERS, LinksRouteSkeleton } from './LinksRouteSkeleton';

describe('LinksRouteSkeleton', () => {
  it('draws the loaded header row over eight held rows, axe-clean', async () => {
    const { container } = render(<LinksRouteSkeleton />);

    const region = screen.getByLabelText('Loading Links');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region).toHaveAttribute('aria-live', 'polite');

    const table = within(screen.getByTestId('links-route-skeleton')).getByRole(
      'table'
    );
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map(cell => cell.textContent)).toEqual(
      LINKS_TABLE_HEADERS.map(header => header.name)
    );
    // Right-aligned columns keep their alignment so the loaded numbers land
    // under the same edge.
    for (const [index, header] of LINKS_TABLE_HEADERS.entries())
      expect(headers[index].className.includes('text-right')).toBe(
        header.align === 'right'
      );

    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      const cells = within(row).getAllByRole('cell');
      expect(cells).toHaveLength(LINKS_TABLE_HEADERS.length);
      for (const cell of cells) {
        expect(cell.textContent).toBe('');
        expect(cell.firstElementChild).toHaveAttribute('aria-hidden', 'true');
      }
    }

    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LinksRouteSkeleton />
      </div>
    );
    expect(screen.getByLabelText('Loading Links')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
