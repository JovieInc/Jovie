import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ColumnLabel } from './ColumnLabel';

type Field = 'title' | 'artist' | 'index';

describe('ColumnLabel certificate', () => {
  it('sorts by click and keyboard and brightens the active column, axe-clean', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const { container, rerender } = render(
      <ColumnLabel<Field>
        field='title'
        label='Title'
        align='left'
        sortBy='artist'
        sortDir='asc'
        onSort={onSort}
      />
    );

    const header = screen.getByRole('button', { name: 'Title' });
    expect(header).toHaveClass('text-quaternary-token/85');
    await user.click(header);
    header.focus();
    await user.keyboard('{Enter}');
    expect(onSort).toHaveBeenCalledTimes(2);
    expect(onSort).toHaveBeenCalledWith('title');
    await expectNoA11yViolations(container);

    rerender(
      <ColumnLabel<Field>
        field='title'
        label='Title'
        align='left'
        sortBy='title'
        sortDir='desc'
        onSort={onSort}
      />
    );
    expect(screen.getByRole('button', { name: 'Title' })).toHaveClass(
      'text-accent-text/90'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the default field muted and a long right-aligned label axe-clean in rtl', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ColumnLabel<Field>
          field='index'
          label='تاريخ الإصدار الأصلي'
          align='right'
          width='w-24'
          sortBy='index'
          sortDir='asc'
          defaultField='index'
          onSort={vi.fn()}
          className='custom'
        />
      </div>
    );

    const header = screen.getByRole('button');
    expect(header).toHaveClass('flex-row-reverse', 'w-24', 'custom');
    expect(header).not.toHaveClass('text-accent-text/90');
    await expectNoA11yViolations(container);
  });
});
