import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TableCountBadge } from './TableCountBadge';

describe('TableCountBadge', () => {
  it('shows the total when nothing is selected', async () => {
    const { container } = render(<TableCountBadge totalCount={128} />);

    const badge = screen.getByText('128 total');
    expect(badge).toHaveClass('rounded-full', 'tabular-nums');
    await expectNoA11yViolations(container);
  });

  it('shows the selection count when items are selected', async () => {
    const { container } = render(
      <TableCountBadge selectedCount={5} totalCount={128} />
    );

    expect(screen.getByText('5 selected')).toBeInTheDocument();
    expect(screen.queryByText('128 total')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('uses plain text styling for the text variant', async () => {
    const { container } = render(
      <TableCountBadge
        selectedCount={0}
        totalCount={0}
        variant='text'
        className='custom'
      />
    );

    const badge = screen.getByText('0 total');
    expect(badge).not.toHaveClass('rounded-full');
    expect(badge).toHaveClass('custom');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <TableCountBadge selectedCount={1284903} totalCount={2000000} />
      </div>
    );

    expect(screen.getByText('1284903 selected')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
