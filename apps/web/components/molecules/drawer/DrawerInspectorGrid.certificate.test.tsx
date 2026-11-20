import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerInspectorGrid } from './DrawerInspectorGrid';
import { DrawerPropertyRow } from './DrawerPropertyRow';

describe('DrawerInspectorGrid certificate', () => {
  it('defaults the label width to 92px, axe-clean', async () => {
    const { container } = render(
      <DrawerInspectorGrid data-testid='grid'>
        <DrawerPropertyRow label='Status' value='Ready' />
        <DrawerPropertyRow label='Audience' value='Not counted yet' />
      </DrawerInspectorGrid>
    );

    const grid = screen.getByTestId('grid');
    expect(grid).toHaveStyle({ '--drawer-inspector-label-width': '92px' });
    expect(grid).toHaveClass('space-y-0.5');
    expect(screen.getByText('Not counted yet')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL rows axe-clean with a wider label column', async () => {
    const value =
      'Returning listeners who saved two or more releases in the last 90 days';
    const { container } = render(
      <div dir='rtl'>
        <DrawerInspectorGrid
          labelWidth={128}
          className='pt-2'
          data-testid='grid'
        >
          <DrawerPropertyRow label='Primary audience segment' value={value} />
          <DrawerPropertyRow label='الحالة' value='جاهز' />
        </DrawerInspectorGrid>
      </div>
    );

    const grid = screen.getByTestId('grid');
    expect(grid).toHaveStyle({ '--drawer-inspector-label-width': '128px' });
    expect(grid).toHaveClass('pt-2');
    expect(screen.getByText(value)).toBeVisible();
    expect(screen.getByText('جاهز')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
