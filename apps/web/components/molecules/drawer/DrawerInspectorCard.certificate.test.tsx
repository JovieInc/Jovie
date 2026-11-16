import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerInspectorCard } from './DrawerInspectorCard';
import { DrawerPropertyRow } from './DrawerPropertyRow';

describe('DrawerInspectorCard certificate', () => {
  it('collapses and expands from its title, axe-clean in both states', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DrawerInspectorCard title='Details' gridTestId='details-grid'>
        <DrawerPropertyRow label='ISRC' value='USRC17607839' />
      </DrawerInspectorCard>
    );

    const toggle = screen.getByRole('button', { name: 'Details' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('USRC17607839')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('USRC17607839')).not.toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('publishes the label width to its grid', async () => {
    const { container } = render(
      <DrawerInspectorCard
        title='Details'
        labelWidth={120}
        gridTestId='details-grid'
        gridClassName='pt-1'
      >
        <DrawerPropertyRow label='UPC' value='Not assigned yet' />
      </DrawerInspectorCard>
    );

    const grid = screen.getByTestId('details-grid');
    expect(grid).toHaveStyle({ '--drawer-inspector-label-width': '120px' });
    expect(grid).toHaveClass('pt-1');
    await expectNoA11yViolations(container);
  });

  it('renders a static heading with actions when not collapsible', async () => {
    const { container } = render(
      <DrawerInspectorCard
        title='Details'
        collapsible={false}
        actions={<button type='button'>Edit</button>}
      >
        <DrawerPropertyRow label='ISRC' value='USRC17607839' />
      </DrawerInspectorCard>
    );

    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
    expect(screen.getByText('Details')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL rows axe-clean', async () => {
    const holder =
      'Independent Artist Collective and Partners Publishing Group';
    const { container } = render(
      <div dir='rtl'>
        <DrawerInspectorCard title='Distribution and rights details for every territory'>
          <DrawerPropertyRow label='Rights holder' value={holder} />
          <DrawerPropertyRow label='الحالة' value='جاهز' />
        </DrawerInspectorCard>
      </div>
    );

    expect(screen.getByText(holder)).toBeVisible();
    expect(screen.getByText('جاهز')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
