import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type MerchPricingPresetOption,
  MerchPricingPresetPicker,
} from './MerchPricingPresetPicker';

const options: MerchPricingPresetOption[] = [
  { preset: 'safe', label: 'Safe', salePrice: '$24', profit: '$6' },
  { preset: 'standard', label: 'Standard', salePrice: '$28', profit: '$10' },
  {
    preset: 'aggressive',
    label: 'Aggressive',
    salePrice: '$32',
    profit: '$14',
  },
];

describe('MerchPricingPresetPicker', () => {
  it('offers each preset as a radio and checks the current one', () => {
    render(
      <MerchPricingPresetPicker
        options={options}
        value='standard'
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole('group', { name: 'Pricing preset' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Safe' })).not.toBeChecked();
  });

  it('reports the chosen preset on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MerchPricingPresetPicker
        options={options}
        value='standard'
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('radio', { name: 'Aggressive' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('aggressive');
  });

  it('moves between presets with the arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MerchPricingPresetPicker
        options={options}
        value='standard'
        onChange={onChange}
      />
    );

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Standard' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('aggressive');
  });

  it('keeps the native radio in the page but visually hidden', () => {
    render(
      <MerchPricingPresetPicker
        options={options}
        value='safe'
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole('radio', { name: 'Safe' })).toHaveClass('sr-only');
  });

  it('renders a labelled, empty group when there are no options', () => {
    render(
      <MerchPricingPresetPicker options={[]} value='safe' onChange={vi.fn()} />
    );

    expect(
      screen.getByRole('group', { name: 'Pricing preset' })
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('has no accessibility violations, with and without options', async () => {
    const { container, rerender } = render(
      <MerchPricingPresetPicker
        options={options}
        value='standard'
        onChange={vi.fn()}
      />
    );
    await expectNoA11yViolations(container);

    rerender(
      <MerchPricingPresetPicker options={[]} value='safe' onChange={vi.fn()} />
    );
    await expectNoA11yViolations(container);
  });
});
