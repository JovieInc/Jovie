import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { Grid3x3, LayoutList, Table2 } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ViewModeSlider,
  type ViewModeSliderOption,
} from '@/components/organisms/table/molecules/ViewModeSlider';

type Mode = 'grid' | 'list' | 'table';

const OPTIONS: readonly ViewModeSliderOption<Mode>[] = [
  { value: 'grid', label: 'Grid View', icon: Grid3x3 },
  { value: 'list', label: 'List View', icon: LayoutList },
  { value: 'table', label: 'Table View', icon: Table2 },
];

function renderSlider(props: {
  readonly value: Mode;
  readonly onChange: (value: Mode) => void;
}) {
  return render(
    <TooltipProvider>
      <ViewModeSlider
        aria-label='Library View'
        data-testid='view-mode-slider'
        value={props.value}
        onChange={props.onChange}
        options={OPTIONS}
      />
    </TooltipProvider>
  );
}

function ControlledSlider({ initial }: { readonly initial: Mode }) {
  const [value, setValue] = useState<Mode>(initial);
  return (
    <TooltipProvider>
      <ViewModeSlider
        aria-label='Library View'
        data-testid='view-mode-slider'
        value={value}
        onChange={setValue}
        options={OPTIONS}
      />
    </TooltipProvider>
  );
}

describe('ViewModeSlider', () => {
  it('renders one radio group with a radio per option and marks the active one checked', () => {
    renderSlider({ value: 'list', onChange: vi.fn() });

    // A native <fieldset> of <input type="radio"> options has an implicit
    // "group" role; each option still gets a real, native "radio" role.
    const group = screen.getByRole('group', { name: 'Library View' });
    expect(group).toBeInTheDocument();

    const grid = screen.getByRole('radio', { name: 'Grid View' });
    const list = screen.getByRole('radio', { name: 'List View' });
    const table = screen.getByRole('radio', { name: 'Table View' });

    expect(grid).not.toBeChecked();
    expect(list).toBeChecked();
    expect(table).not.toBeChecked();
  });

  it('uses roving tabindex so only the active option is tab-stoppable', () => {
    renderSlider({ value: 'grid', onChange: vi.fn() });

    expect(screen.getByRole('radio', { name: 'Grid View' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByRole('radio', { name: 'List View' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
    expect(screen.getByRole('radio', { name: 'Table View' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('calls onChange when a non-active option is clicked', () => {
    const onChange = vi.fn();
    renderSlider({ value: 'grid', onChange });

    fireEvent.click(screen.getByRole('radio', { name: 'Table View' }));

    expect(onChange).toHaveBeenCalledWith('table');
  });

  it('moves selection and focus with arrow keys, wrapping at the ends', () => {
    render(<ControlledSlider initial='grid' />);

    const grid = screen.getByRole('radio', { name: 'Grid View' });
    const list = screen.getByRole('radio', { name: 'List View' });
    const table = screen.getByRole('radio', { name: 'Table View' });

    grid.focus();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(list).toBeChecked();
    expect(document.activeElement).toBe(list);

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(table).toBeChecked();

    // Wraps from the last option back to the first.
    fireEvent.keyDown(table, { key: 'ArrowRight' });
    expect(grid).toBeChecked();

    // Wraps backward from the first option to the last.
    fireEvent.keyDown(grid, { key: 'ArrowLeft' });
    expect(table).toBeChecked();
  });

  it('jumps to the first/last option on Home/End', () => {
    render(<ControlledSlider initial='list' />);

    const grid = screen.getByRole('radio', { name: 'Grid View' });
    const list = screen.getByRole('radio', { name: 'List View' });
    const table = screen.getByRole('radio', { name: 'Table View' });

    fireEvent.keyDown(list, { key: 'End' });
    expect(table).toBeChecked();

    fireEvent.keyDown(table, { key: 'Home' });
    expect(grid).toBeChecked();
  });

  it('renders a single elevated sliding indicator that animates via transform only and is reduced-motion safe', () => {
    renderSlider({ value: 'grid', onChange: vi.fn() });

    const thumb = screen.getByTestId('view-mode-slider-thumb');
    expect(thumb).toHaveAttribute('aria-hidden', 'true');
    expect(thumb).toHaveClass('shadow-sm');
    expect(thumb.className).toContain('transition-transform');
    expect(thumb.className).toContain('motion-reduce:transition-none');
  });

  it('keeps each option icon-only with the label as the accessible name and tooltip', () => {
    renderSlider({ value: 'grid', onChange: vi.fn() });

    const grid = screen.getByRole('radio', { name: 'Grid View' });
    expect(grid).toHaveAccessibleName('Grid View');

    const icon = grid.closest('label')?.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
