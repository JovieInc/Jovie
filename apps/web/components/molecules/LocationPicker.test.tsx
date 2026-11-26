import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

let popoverOpen = false;
let popoverOnOpenChange: ((open: boolean) => void) | undefined;

vi.mock('@jovie/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@jovie/ui')>();
  return {
    ...actual,
    Popover: ({
      children,
      open,
      onOpenChange,
    }: {
      children: ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => {
      popoverOpen = open ?? false;
      popoverOnOpenChange = onOpenChange;
      return <div data-testid='popover-root'>{children}</div>;
    },
    PopoverTrigger: ({
      children,
      asChild,
    }: {
      children: ReactNode;
      asChild?: boolean;
    }) => {
      const open = () => popoverOnOpenChange?.(!popoverOpen);
      if (asChild && isValidElement(children)) {
        const child = children as ReactElement<{
          onClick?: (event: MouseEvent) => void;
        }>;
        return cloneElement(child, {
          'data-testid': 'popover-trigger',
          onClick: (event: MouseEvent) => {
            child.props.onClick?.(event);
            open();
          },
        } as never);
      }
      return (
        <button data-testid='popover-trigger' type='button' onClick={open}>
          {children}
        </button>
      );
    },
    PopoverContent: ({
      children,
    }: {
      children: ReactNode;
      [key: string]: unknown;
    }) =>
      popoverOpen ? <div data-testid='popover-content'>{children}</div> : null,
  };
});

import { LocationPicker } from './LocationPicker';

function renderPicker(
  props: Partial<React.ComponentProps<typeof LocationPicker>> = {}
) {
  const defaultProps = {
    value: null as string | null,
    onSelect: vi.fn(),
    trigger: <button type='button'>Pick location</button>,
    ...props,
  };
  return {
    ...render(<LocationPicker {...defaultProps} />),
    onSelect: defaultProps.onSelect,
  };
}

describe('LocationPicker', () => {
  it('has no axe violations when closed and open', async () => {
    const user = userEvent.setup();
    const { container } = renderPicker();
    await expectNoA11yViolations(container);
    await user.click(screen.getByText('Pick location'));
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' className='w-64'>
        <LocationPicker
          value='nashville, tn'
          onSelect={vi.fn()}
          trigger={<button type='button'>اختيار</button>}
        />
      </div>
    );
    await user.click(screen.getByText('اختيار'));
    await expectNoA11yViolations(container);
  });

  it('keeps typed search across parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <LocationPicker
        value={null}
        onSelect={onSelect}
        trigger={<button type='button'>Pick location</button>}
      />
    );
    await user.click(screen.getByText('Pick location'));
    const input = screen.getByPlaceholderText('Search cities...');
    await user.type(input, 'nash');
    expect(input).toHaveValue('nash');
    expect(input).toHaveFocus();
    rerender(
      <LocationPicker
        value={null}
        onSelect={onSelect}
        trigger={<button type='button'>Pick location</button>}
      />
    );
    expect(screen.getByPlaceholderText('Search cities...')).toHaveValue('nash');
    expect(screen.getByPlaceholderText('Search cities...')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('uses PlainButton options and HostDrawnInput search', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByText('Pick location'));
    const search = screen.getByPlaceholderText('Search cities...');
    expect(search.getAttribute('data-host-drawn')).toBe('');
    const option = screen.getAllByTestId('location-picker-option')[0];
    expect(option?.getAttribute('data-slot')).toBe('plain-button');
  });
});
