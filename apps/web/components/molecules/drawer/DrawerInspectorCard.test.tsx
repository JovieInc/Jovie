import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DrawerFormGridRow } from './DrawerFormGridRow';
import { DrawerInspectorCard } from './DrawerInspectorCard';
import { DrawerPropertyRow } from './DrawerPropertyRow';

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

    expect(card).toHaveAttribute('data-variant', 'card');
    expect(grid).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Single')).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();
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

    expect(screen.getByTestId('details-grid')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
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

    const reopenedInput = screen.getByRole('textbox', {
      name: 'Editable value',
    });

    expect(reopenedInput).toBeVisible();
    expect(reopenedInput).toHaveValue('Saved draft');
  });
});
