import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppSegmentControl } from './AppSegmentControl';

const options = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
] as const;

describe('AppSegmentControl', () => {
  it.each(['muted', 'ghost'] as const)(
    'keeps the %s radio choice named and axe-clean across selection',
    async surface => {
      const user = userEvent.setup();
      const onValueChange = vi.fn();
      const view = (value: 'details' | 'activity') => (
        <AppSegmentControl
          value={value}
          onValueChange={onValueChange}
          options={options}
          surface={surface}
          semantics='radio'
          aria-label='Entity view'
        />
      );
      const { container, rerender } = render(view('details'));

      expect(
        screen.getByRole('radiogroup', { name: 'Entity view' })
      ).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Details' })).toBeChecked();
      await expectNoA11yViolations(container);

      await user.click(screen.getByRole('radio', { name: 'Activity' }));
      expect(onValueChange).toHaveBeenCalledExactlyOnceWith('activity');
      rerender(view('activity'));

      expect(screen.getByRole('radio', { name: 'Activity' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Activity' })).toHaveFocus();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('keeps the RTL tablist and disabled option named and axe-clean', async () => {
    const { container } = render(
      <AppSegmentControl
        value='details'
        onValueChange={vi.fn()}
        options={[options[0], { ...options[1], disabled: true }]}
        dir='rtl'
        aria-label='Entity view'
      />
    );

    expect(
      screen.getByRole('tablist', { name: 'Entity view' })
    ).toHaveAttribute('aria-orientation', 'horizontal');
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

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
