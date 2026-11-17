import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerInspectorStack } from './DrawerInspectorStack';
import { DrawerPropertyRow } from './DrawerPropertyRow';

describe('DrawerInspectorStack certificate', () => {
  it('stacks rows with the default spacing, axe-clean', async () => {
    const { container } = render(
      <DrawerInspectorStack data-testid='stack'>
        <DrawerPropertyRow label='Release' value='Summer EP' />
        <DrawerPropertyRow label='Status' value='Draft' />
      </DrawerInspectorStack>
    );

    const stack = screen.getByTestId('stack');
    expect(stack).toHaveClass('space-y-2');
    expect(stack.children).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL rows axe-clean with custom spacing', async () => {
    const value =
      'Summer EP (Deluxe Edition with Bonus Remixes and Acoustic Versions)';
    const { container } = render(
      <div dir='rtl'>
        <DrawerInspectorStack data-testid='stack' className='space-y-4'>
          <DrawerPropertyRow label='Release' value={value} />
          <DrawerPropertyRow label='الحالة' value='مسودة' />
        </DrawerInspectorStack>
      </div>
    );

    expect(screen.getByTestId('stack')).toHaveClass('space-y-4');
    expect(screen.getByText(value)).toBeVisible();
    expect(screen.getByText('مسودة')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
