import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerSettingsToggle } from './DrawerSettingsToggle';

describe('DrawerSettingsToggle', () => {
  it('toggles through the labelled switch', () => {
    const onCheckedChange = vi.fn();
    render(
      <DrawerSettingsToggle
        label='Show on profile'
        ariaLabel='Show on profile'
        checked={false}
        onCheckedChange={onCheckedChange}
        testId='toggle'
      />
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Show on profile' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('toggle')).toHaveClass('py-1');
  });

  it('disables the switch and dims the row while saving', () => {
    render(
      <DrawerSettingsToggle
        label='Show on profile'
        ariaLabel='Show on profile'
        checked
        disabled
        onCheckedChange={vi.fn()}
        testId='toggle'
      />
    );
    expect(screen.getByRole('switch', { name: 'Show on profile' })).toBeDisabled();
    expect(screen.getByTestId('toggle')).toHaveClass('opacity-60');
  });
});
