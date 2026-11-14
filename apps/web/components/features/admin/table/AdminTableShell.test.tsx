import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  AdminTableShell,
  type AdminTableShellRenderProps,
} from './AdminTableShell';

const ROW_LABELS = Array.from(
  { length: 40 },
  (_, index) => `Table row ${index + 1}`
);

function Rows({ headerElevated, stickyTopPx }: AdminTableShellRenderProps) {
  return (
    <div
      data-testid='rows'
      data-elevated={String(headerElevated)}
      data-sticky-top={stickyTopPx}
    >
      Table rows
    </div>
  );
}

function scrollTo(element: HTMLElement, top: number) {
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    value: top,
  });
  fireEvent.scroll(element);
}

describe('AdminTableShell', () => {
  it('renders only the content region when no toolbar or footer is given', async () => {
    const { container } = render(
      <AdminTableShell testId='shell'>{Rows}</AdminTableShell>
    );
    const shell = screen.getByTestId('shell');
    expect(shell.children).toHaveLength(1);
    expect(screen.getByTestId('rows')).toHaveAttribute(
      'data-elevated',
      'false'
    );
    expect(screen.getByTestId('rows')).toHaveAttribute('data-sticky-top', '0');
    await expectNoA11yViolations(container);
  });

  it('places the toolbar above and the footer below the content', async () => {
    const { container } = render(
      <AdminTableShell
        testId='shell'
        className='custom-shell'
        toolbar={<div>Creators</div>}
        footer={<div>1,204 creators</div>}
      >
        {Rows}
      </AdminTableShell>
    );
    const shell = screen.getByTestId('shell');
    expect(shell).toHaveClass('custom-shell');
    expect(Array.from(shell.children).map(child => child.textContent)).toEqual([
      'Creators',
      'Table rows',
      '1,204 creators',
    ]);
    await expectNoA11yViolations(container);
  });

  it('elevates the header while the table is scrolled and settles at the top', () => {
    render(
      <AdminTableShell testId='shell' toolbar={<div>Creators</div>}>
        {Rows}
      </AdminTableShell>
    );
    const rows = screen.getByTestId('rows');
    const toolbar = screen.getByText('Creators').parentElement as HTMLElement;
    expect(toolbar).not.toHaveClass('dark:shadow-inset-highlight');

    scrollTo(rows, 120);
    expect(rows).toHaveAttribute('data-elevated', 'true');
    expect(toolbar).toHaveClass('dark:shadow-inset-highlight');

    scrollTo(rows, 0);
    expect(rows).toHaveAttribute('data-elevated', 'false');
    expect(toolbar).not.toHaveClass('dark:shadow-inset-highlight');
  });

  it('forwards the scroll container ref and props', () => {
    const ref = createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement>;
    const onKeyDown = vi.fn();
    render(
      <AdminTableShell
        scrollContainerRef={ref}
        scrollContainerProps={{
          tabIndex: 0,
          role: 'region',
          'aria-label': 'Creators Table',
          onKeyDown,
        }}
      >
        {Rows}
      </AdminTableShell>
    );
    const region = screen.getByRole('region', { name: 'Creators Table' });
    expect(ref.current).toBe(region);
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('stays axe clean with long content inside a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AdminTableShell
          toolbar={<div>المبدعون</div>}
          footer={<div>1,204 مبدعًا</div>}
        >
          {() => (
            <ul>
              {ROW_LABELS.map(label => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
        </AdminTableShell>
      </div>
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(40);
    expect(screen.getByText('المبدعون')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
