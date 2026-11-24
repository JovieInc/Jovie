import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }) => {
      popoverOpen = open ?? false;
      popoverOnOpenChange = onOpenChange;
      return <div data-testid='popover-root'>{children}</div>;
    },
    PopoverTrigger: ({
      children,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    }) => (
      // biome-ignore lint/a11y/useKeyWithClickEvents: test mock only
      // biome-ignore lint/a11y/noStaticElementInteractions: test mock only
      <div
        data-testid='popover-trigger'
        onClick={() => popoverOnOpenChange?.(!popoverOpen)}
      >
        {children}
      </div>
    ),
    PopoverContent: ({
      children,
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) =>
      popoverOpen ? <div data-testid='popover-content'>{children}</div> : null,
  };
});

import { GenrePicker } from './GenrePicker';

function renderPicker(
  props: Partial<React.ComponentProps<typeof GenrePicker>> = {}
) {
  const defaultProps = {
    selected: [] as string[],
    onChange: vi.fn(),
    trigger: <button type='button'>Edit genres</button>,
    ...props,
  };
  return {
    ...render(<GenrePicker {...defaultProps} />),
    onChange: defaultProps.onChange,
  };
}

describe('GenrePicker', () => {
  it('has no axe violations when closed and open', async () => {
    const user = userEvent.setup();
    const { container } = renderPicker();
    await expectNoA11yViolations(container);
    await user.click(screen.getByText('Edit genres'));
    await expectNoA11yViolations(container);
  });

  it('has no axe violations in an RTL overflow frame', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div dir='rtl' className='w-56'>
        <GenrePicker
          selected={['pop']}
          onChange={vi.fn()}
          trigger={<button type='button'>اختيار</button>}
        />
      </div>
    );
    await user.click(screen.getByText('اختيار'));
    await expectNoA11yViolations(container);
  });

  it('keeps typed search across parent rerender and Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <GenrePicker
        selected={[]}
        onChange={onChange}
        trigger={<button type='button'>Edit genres</button>}
      />
    );
    await user.click(screen.getByText('Edit genres'));
    const input = screen.getByPlaceholderText('Search genres...');
    await user.type(input, 'jazz');
    expect(input).toHaveValue('jazz');
    expect(input).toHaveFocus();
    rerender(
      <GenrePicker
        selected={[]}
        onChange={onChange}
        trigger={<button type='button'>Edit genres</button>}
      />
    );
    expect(screen.getByPlaceholderText('Search genres...')).toHaveValue('jazz');
    expect(screen.getByPlaceholderText('Search genres...')).toHaveFocus();
    await user.keyboard('{Escape}');
    // Escape blurs; value must still match until the popover close clears it.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses PlainButton options and HostDrawnInput search', async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByText('Edit genres'));
    const search = screen.getByPlaceholderText('Search genres...');
    expect(search.getAttribute('data-host-drawn')).toBe('');
    const option = screen.getAllByTestId('genre-picker-option')[0];
    expect(option?.getAttribute('data-slot')).toBe('plain-button');
  });
});
