import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TableMetaContext, type TableMeta } from '@/contexts/TableMetaContext';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerToggleButton } from './DrawerToggleButton';

function DrawerMeta({
  children,
  onToggle,
  registered = true,
}: Readonly<{
  children: ReactNode;
  onToggle?: () => void;
  registered?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  const [tableMeta, setTableMeta] = useState<TableMeta>({ rowCount: 3 });
  const value = useMemo(
    () => ({
      tableMeta: {
        ...tableMeta,
        rightPanelWidth: open ? 320 : 0,
        toggle: registered
          ? () => {
              onToggle?.();
              setOpen(current => !current);
            }
          : null,
      },
      setTableMeta,
    }),
    [onToggle, open, registered, tableMeta]
  );
  return (
    <TooltipProvider>
      <TableMetaContext.Provider value={value}>{children}</TableMetaContext.Provider>
    </TooltipProvider>
  );
}

describe('DrawerToggleButton certificate', () => {
  it('toggles the drawer from the rail chrome and reflects its open state', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(
      <DrawerMeta onToggle={onToggle}>
        <DrawerToggleButton />
      </DrawerMeta>
    );

    const button = screen.getByRole('button', {
      name: 'Toggle details sidebar',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });

  it('toggles from the page-toolbar chrome with a custom label', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { container } = render(
      <DrawerMeta onToggle={onToggle}>
        <DrawerToggleButton
          chrome='page-toolbar'
          label='Release analytics and audience insights'
          ariaLabel='Toggle insights sidebar'
        />
      </DrawerMeta>
    );

    const button = screen.getByRole('button', {
      name: 'Toggle insights sidebar',
    });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });

  it('is disabled when no drawer toggle is registered', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DrawerMeta registered={false}>
        <DrawerToggleButton />
        <DrawerToggleButton chrome='page-toolbar' ariaLabel='Toolbar toggle' />
      </DrawerMeta>
    );

    const rail = screen.getByRole('button', { name: 'Toggle details sidebar' });
    const toolbar = screen.getByRole('button', { name: 'Toolbar toggle' });
    expect(rail).toBeDisabled();
    expect(toolbar).toBeDisabled();
    await user.click(rail);
    expect(rail).toHaveAttribute('aria-expanded', 'false');
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <DrawerMeta>
          <DrawerToggleButton
            chrome='page-toolbar'
            label='التفاصيل'
            ariaLabel='تبديل الشريط الجانبي للتفاصيل'
          />
        </DrawerMeta>
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'تبديل الشريط الجانبي للتفاصيل' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });
});
