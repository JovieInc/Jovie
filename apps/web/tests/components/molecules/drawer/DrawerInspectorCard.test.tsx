import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  DrawerFormGridRow,
  DrawerInspectorCard,
  DrawerPropertyRow,
} from '@/components/molecules/drawer';

function StatefulField() {
  const [value, setValue] = useState('Draft');

  return (
    <input
      aria-label='Editable value'
      value={value}
      onChange={event => setValue(event.target.value)}
    />
  );
}

describe('DrawerInspectorCard', () => {
  it('renders a card section with a shared inspector grid', () => {
    render(
      <DrawerInspectorCard
        title='Properties'
        data-testid='properties-card'
        gridTestId='properties-grid'
      >
        <DrawerPropertyRow label='Type' value='Single' />
        <DrawerFormGridRow label='Label'>
          <input aria-label='Label' />
        </DrawerFormGridRow>
      </DrawerInspectorCard>
    );

    const card = screen.getByTestId('properties-card');
    const grid = screen.getByTestId('properties-grid');
    const propertyRow = screen.getByText('Type').closest('div');
    const formRow = screen.getByText('Label').closest('div');

    expect(card).toHaveAttribute('data-variant', 'card');
    expect(grid).toHaveClass('space-y-0.5');
    expect(grid).toHaveStyle({
      '--drawer-inspector-label-width': '92px',
    });
    expect(propertyRow).toHaveStyle({
      gridTemplateColumns:
        'var(--drawer-inspector-label-width, 92px) minmax(0, 1fr)',
    });
    expect(formRow).toHaveStyle({
      gridTemplateColumns:
        'var(--drawer-inspector-label-width, 92px) minmax(0, 1fr)',
    });
  });

  it('allows a card-level label width override', () => {
    render(
      <DrawerInspectorCard
        title='Details'
        labelWidth={104}
        gridTestId='details-grid'
      >
        <DrawerPropertyRow label='Source' value='Manual' />
      </DrawerInspectorCard>
    );

    expect(screen.getByTestId('details-grid')).toHaveStyle({
      '--drawer-inspector-label-width': '104px',
    });
  });

  it('preserves child state while collapsed', async () => {
    const user = userEvent.setup();

    render(
      <DrawerInspectorCard title='Fields'>
        <StatefulField />
      </DrawerInspectorCard>
    );

    const toggle = screen.getByRole('button', { name: 'Fields' });
    const input = screen.getByRole('textbox', { name: 'Editable value' });

    await user.clear(input);
    await user.type(input, 'Saved draft');
    await user.click(toggle);

    expect(input).not.toBeVisible();

    await user.click(toggle);

    expect(input).toHaveValue('Saved draft');
  });
});
