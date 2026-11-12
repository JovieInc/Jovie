import { render, screen } from '@testing-library/react';
import { createRef, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { GroupHeader } from './GroupHeader';

function renderHeader(ui: ReactNode, dir?: 'rtl') {
  return render(
    <table dir={dir} lang={dir === 'rtl' ? 'ar' : 'en'}>
      <caption>Fans by status</caption>
      <tbody>{ui}</tbody>
    </table>
  );
}

describe('GroupHeader', () => {
  it('names the group with its count across every column', () => {
    renderHeader(<GroupHeader label='New' count={12} colSpan={4} />);

    expect(screen.getByRole('row', { name: 'New (12)' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'New (12)' })).toHaveAttribute(
      'colspan',
      '4'
    );
  });

  it('sticks at the measured offset by default and forwards its row ref', () => {
    const ref = createRef<HTMLTableRowElement>();
    renderHeader(
      <GroupHeader
        ref={ref}
        label='Returning'
        count={3}
        colSpan={2}
        stickyOffset={48}
      />
    );

    const row = screen.getByRole('row', { name: 'Returning (3)' });
    expect(ref.current).toBe(row);
    expect(row).toHaveClass('sticky');
    expect(row).toHaveStyle({ top: '48px' });
  });

  it('applies label and count classes for the upcoming-group fade', () => {
    renderHeader(
      <GroupHeader
        label='Invited'
        count={5}
        colSpan={1}
        isSticky={false}
        labelClassName='text-secondary-token'
        countClassName='text-tertiary-token'
      />
    );

    expect(screen.getByRole('row', { name: 'Invited (5)' }).style.top).toBe('');
    expect(screen.getByText('(5)')).toHaveClass('text-tertiary-token');
    expect(screen.getByText('(5)').parentElement).toHaveClass(
      'text-secondary-token'
    );
  });

  it.each([
    ['sticky', <GroupHeader key='a' label='New' count={12} colSpan={2} />],
    [
      'a long label',
      <GroupHeader
        key='b'
        label='Awaiting Confirmation From Their Label Before The Release Date'
        count={128400}
        colSpan={2}
      />,
    ],
  ])('has no accessibility violations with %s', async (_name, ui) => {
    const { container } = renderHeader(ui);
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations in rtl', async () => {
    const { container } = renderHeader(
      <GroupHeader label='المشتركون الجدد' count={12} colSpan={2} />,
      'rtl'
    );
    await expectNoA11yViolations(container);
  });
});
