import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableHeaderRow } from './TableHeaderRow';

describe('TableHeaderRow certificate', () => {
  it('renders column headers axe-clean with no offset style by default', async () => {
    const { container } = render(
      <table>
        <thead>
          <TableHeaderRow className='custom-row'>
            <th scope='col'>Name</th>
            <th scope='col'>Status</th>
          </TableHeaderRow>
        </thead>
      </table>
    );

    const row = screen.getByRole('row');
    expect(row).toHaveClass('custom-row');
    expect(row).not.toHaveAttribute('style');
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('applies a sticky offset in an RTL table', async () => {
    const { container } = render(
      <table dir='rtl'>
        <thead>
          <TableHeaderRow stickyOffset={40}>
            <th scope='col'>الاسم</th>
            <th scope='col'>الحالة</th>
          </TableHeaderRow>
        </thead>
      </table>
    );

    expect(screen.getByRole('row')).toHaveStyle({ top: '40px' });
    expect(
      screen.getByRole('columnheader', { name: 'الاسم' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
