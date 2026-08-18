import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerChoiceChipGroup } from './DrawerChoiceChipGroup';

const OPTIONS = [
  { value: 'north-america', label: 'North America' },
  { value: 'europe', label: 'Europe' },
  { value: 'disabled', label: 'Unavailable', disabled: true },
] as const;

describe('DrawerChoiceChipGroup', () => {
  it('wraps compact choices and exposes selected state without elevation', async () => {
    const { container } = render(
      <DrawerChoiceChipGroup
        options={OPTIONS}
        selectedValues={['north-america']}
        onToggle={() => undefined}
        ariaLabel='Contact territories'
        testId='territory-choices'
      />
    );

    const group = screen.getByRole('group', { name: 'Contact territories' });
    const selected = screen.getByRole('button', { name: 'North America' });
    const unselected = screen.getByRole('button', { name: 'Europe' });

    expect(group).toHaveClass('flex', 'flex-wrap', 'gap-1.5');
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected).toHaveAttribute('data-state', 'on');
    expect(selected).toHaveClass(
      'min-h-11',
      'sm:min-h-7',
      'rounded-md',
      'border-default',
      'bg-surface-1',
      'shadow-none',
      'focus-visible:ring-2'
    );
    expect(unselected).toHaveAttribute('aria-pressed', 'false');
    expect(unselected).toHaveClass('border-transparent', 'bg-surface-0');
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('notifies the owner with the toggled value', () => {
    const onToggle = vi.fn();
    render(
      <DrawerChoiceChipGroup
        options={OPTIONS}
        selectedValues={[]}
        onToggle={onToggle}
        ariaLabel='Contact territories'
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Europe' }));
    expect(onToggle).toHaveBeenCalledWith('europe');
  });
});
