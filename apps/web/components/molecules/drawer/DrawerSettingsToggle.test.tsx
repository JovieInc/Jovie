import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerSettingsToggle } from './DrawerSettingsToggle';

describe('DrawerSettingsToggle', () => {
  it('toggles through the labelled switch', async () => {
    const onCheckedChange = vi.fn();
    const { container } = render(
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
    await expectNoA11yViolations(container);
  });

  it('disables the switch and dims the row while saving', async () => {
    const { container } = render(
      <DrawerSettingsToggle
        label='Show on profile'
        ariaLabel='Show on profile'
        checked
        disabled
        onCheckedChange={vi.fn()}
        testId='toggle'
      />
    );
    expect(
      screen.getByRole('switch', { name: 'Show on profile' })
    ).toBeDisabled();
    expect(screen.getByTestId('toggle')).toHaveClass('opacity-60');
    await expectNoA11yViolations(container);
  });

  it('toggles from a long label in the compact density', async () => {
    const onCheckedChange = vi.fn();
    const label =
      'Show this release on your public profile and in every smart link that references it';
    const { container } = render(
      <DrawerSettingsToggle
        label={label}
        ariaLabel='Show this release on your public profile'
        checked
        density='compact'
        onCheckedChange={onCheckedChange}
      />
    );
    fireEvent.click(screen.getByText(label));
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    await expectNoA11yViolations(container);
  });

  it('toggles in a right-to-left drawer', async () => {
    const onCheckedChange = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <DrawerSettingsToggle
          label='إظهار في الملف الشخصي'
          ariaLabel='إظهار في الملف الشخصي'
          checked={false}
          onCheckedChange={onCheckedChange}
        />
      </div>
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'إظهار في الملف الشخصي' })
    );
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    await expectNoA11yViolations(container);
  });
});
