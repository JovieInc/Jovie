import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerPropertyRow } from './DrawerPropertyRow';

describe('DrawerPropertyRow certificate', () => {
  it('calls onClick from pointer and keyboard when interactive, axe-clean', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <DrawerPropertyRow
        interactive
        onClick={onClick}
        label='Release'
        value='Summer EP'
      />
    );

    const row = screen.getByRole('button');
    expect(row).toHaveAttribute('type', 'button');
    await user.click(row);
    row.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('renders term and description elements inside a definition list', async () => {
    const { container } = render(
      <dl>
        <DrawerPropertyRow
          definitionList
          label='UPC'
          value='Not assigned yet'
        />
      </dl>
    );

    expect(screen.getByText('UPC').tagName).toBe('DT');
    const copy = screen.getByRole('button', {
      name: 'Copy UPC: Not assigned yet',
    });
    expect(copy.closest('dd')).toContainElement(
      screen.getByText('Not assigned yet')
    );
    await expectNoA11yViolations(container);
  });

  it('uses a fixed label width and top alignment for long values', async () => {
    const value =
      'Independent Artist Collective and Partners Publishing Group, administered worldwide';
    const { container } = render(
      <DrawerPropertyRow
        label='Rights holder'
        value={value}
        labelWidth={120}
        align='start'
        size='sm'
      />
    );

    const row = container.firstElementChild as HTMLElement;
    expect(row).toHaveClass('items-start');
    expect(row).toHaveStyle({ gridTemplateColumns: '120px minmax(0, 1fr)' });
    expect(screen.getByText(value)).toHaveClass('min-w-0');
    await expectNoA11yViolations(container);
  });

  it('keeps an Arabic row axe-clean inside an RTL drawer', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue();
    const { container } = render(
      <div dir='rtl'>
        <DrawerPropertyRow label='الإصدار' value='ألبوم الصيف' />
      </div>
    );

    const copy = screen.getByRole('button', {
      name: 'Copy الإصدار: ألبوم الصيف',
    });
    await user.tab();
    expect(copy).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(writeText).toHaveBeenCalledWith('ألبوم الصيف');
    expect(copy).toHaveAttribute('data-copy-value', 'success');
    expect(screen.getByText('ألبوم الصيف')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
