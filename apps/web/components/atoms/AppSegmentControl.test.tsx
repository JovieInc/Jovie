import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppSegmentControl } from './AppSegmentControl';

const options = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
] as const;

describe('AppSegmentControl', () => {
  it('maps the muted app surface to the canonical small control contract', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AppSegmentControl
        value='details'
        onValueChange={onValueChange}
        options={options}
        aria-label='Entity view'
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Entity view' });
    const root = tablist.parentElement;
    const details = screen.getByRole('tab', { name: 'Details' });
    const activity = screen.getByRole('tab', { name: 'Activity' });

    expect(root).toHaveAttribute('data-size', 'sm');
    expect(root).toHaveAttribute('data-variant', 'default');
    expect(root).toHaveClass('border-subtle', 'bg-surface-1', 'p-0.5');
    expect(details).toHaveAttribute('aria-selected', 'true');
    expect(details).toHaveClass('data-[state=active]:shadow-none');

    await user.click(activity);
    expect(onValueChange).toHaveBeenCalledWith('activity');
  });

  it('maps the ghost surface without replacing package focus or hit targets', () => {
    render(
      <AppSegmentControl
        value='details'
        onValueChange={() => undefined}
        options={options}
        surface='ghost'
        size='md'
        aria-label='Ghost entity view'
        className='max-w-60'
        triggerClassName='custom-trigger'
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Ghost entity view' });
    const root = tablist.parentElement;
    const details = screen.getByRole('tab', { name: 'Details' });

    expect(root).toHaveAttribute('data-size', 'md');
    expect(root).toHaveAttribute('data-variant', 'ghost');
    expect(root).toHaveClass(
      'border-transparent',
      'bg-transparent',
      'p-0',
      'shadow-none',
      'max-w-60'
    );
    expect(details).toHaveClass(
      'before:h-11',
      'focus-visible:ring-2',
      'custom-trigger'
    );
  });

  it('passes disabled option semantics through to the package owner', () => {
    render(
      <AppSegmentControl
        value='details'
        onValueChange={() => undefined}
        options={[options[0], { ...options[1], disabled: true }]}
        aria-label='Disabled entity view'
      />
    );

    expect(screen.getByRole('tab', { name: 'Activity' })).toBeDisabled();
  });
});
