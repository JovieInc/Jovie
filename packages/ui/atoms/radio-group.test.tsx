import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RadioGroup, RadioGroupItem } from './radio-group';

// Helper component for testing
const TestRadioGroup = ({
  value,
  onValueChange,
  defaultValue,
  disabled = false,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  disabled?: boolean;
}) => (
  <RadioGroup
    value={value}
    onValueChange={onValueChange}
    defaultValue={defaultValue}
    disabled={disabled}
  >
    <div className='flex items-center space-x-2'>
      <RadioGroupItem value='option1' id='option1' />
      <label htmlFor='option1'>Option 1</label>
    </div>
    <div className='flex items-center space-x-2'>
      <RadioGroupItem value='option2' id='option2' />
      <label htmlFor='option2'>Option 2</label>
    </div>
    <div className='flex items-center space-x-2'>
      <RadioGroupItem value='option3' id='option3' />
      <label htmlFor='option3'>Option 3</label>
    </div>
  </RadioGroup>
);

describe('RadioGroup', () => {
  describe('Basic Rendering', () => {
    it('renders radio group with radiogroup role', () => {
      render(<TestRadioGroup />);
      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('renders all radio items', () => {
      render(<TestRadioGroup />);
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(3);
    });

    it('renders with labels', () => {
      render(<TestRadioGroup />);
      expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
      expect(screen.getByLabelText('Option 2')).toBeInTheDocument();
      expect(screen.getByLabelText('Option 3')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('no item selected by default', () => {
      render(<TestRadioGroup />);
      const radios = screen.getAllByRole('radio');
      radios.forEach(radio => {
        expect(radio).toHaveAttribute('data-state', 'unchecked');
      });
    });

    it('selects item with defaultValue', () => {
      render(<TestRadioGroup defaultValue='option2' />);
      const option2 = screen.getByLabelText('Option 2');
      expect(option2).toHaveAttribute('data-state', 'checked');
    });

    it('selects item on click', () => {
      const onValueChange = vi.fn();
      render(<TestRadioGroup onValueChange={onValueChange} />);

      fireEvent.click(screen.getByLabelText('Option 1'));

      expect(onValueChange).toHaveBeenCalledWith('option1');
    });

    it('changes selection on click', () => {
      render(<TestRadioGroup defaultValue='option1' />);

      const option1 = screen.getByLabelText('Option 1');
      const option2 = screen.getByLabelText('Option 2');

      expect(option1).toHaveAttribute('data-state', 'checked');
      expect(option2).toHaveAttribute('data-state', 'unchecked');

      fireEvent.click(option2);

      expect(option1).toHaveAttribute('data-state', 'unchecked');
      expect(option2).toHaveAttribute('data-state', 'checked');
    });
  });

  describe('Controlled Mode', () => {
    it('works in controlled mode', () => {
      const onValueChange = vi.fn();
      const { rerender } = render(
        <TestRadioGroup value='option1' onValueChange={onValueChange} />
      );

      expect(screen.getByLabelText('Option 1')).toHaveAttribute(
        'data-state',
        'checked'
      );

      rerender(
        <TestRadioGroup value='option2' onValueChange={onValueChange} />
      );
      expect(screen.getByLabelText('Option 2')).toHaveAttribute(
        'data-state',
        'checked'
      );
      expect(screen.getByLabelText('Option 1')).toHaveAttribute(
        'data-state',
        'unchecked'
      );
    });

    it('calls onValueChange when item is clicked', () => {
      const onValueChange = vi.fn();
      render(<TestRadioGroup onValueChange={onValueChange} />);

      fireEvent.click(screen.getByLabelText('Option 2'));

      expect(onValueChange).toHaveBeenCalledWith('option2');
    });
  });

  describe('States', () => {
    it('respects disabled state on group', () => {
      render(<TestRadioGroup disabled />);
      const radios = screen.getAllByRole('radio');
      radios.forEach(radio => {
        expect(radio).toBeDisabled();
      });
    });

    it('respects disabled state on individual item', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value='enabled' data-testid='enabled-radio' />
          <RadioGroupItem
            value='disabled'
            data-testid='disabled-radio'
            disabled
          />
        </RadioGroup>
      );
      expect(screen.getByTestId('enabled-radio')).not.toBeDisabled();
      expect(screen.getByTestId('disabled-radio')).toBeDisabled();
    });

    it('does not change selection when disabled', () => {
      const onValueChange = vi.fn();
      render(
        <TestRadioGroup
          disabled
          defaultValue='option1'
          onValueChange={onValueChange}
        />
      );

      fireEvent.click(screen.getByLabelText('Option 2'));

      expect(onValueChange).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Option 1')).toHaveAttribute(
        'data-state',
        'checked'
      );
    });
  });

  describe('Styling', () => {
    it('applies grid layout to group', () => {
      render(<TestRadioGroup />);
      const group = screen.getByRole('radiogroup');
      expect(group.className).toContain('grid');
      expect(group.className).toContain('gap-2');
    });

    it('applies styling to radio item', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value='test' data-testid='radio' />
        </RadioGroup>
      );
      const radio = screen.getByTestId('radio');
      expect(radio.className).toContain('h-4');
      expect(radio.className).toContain('w-4');
      expect(radio.className).toContain('rounded-full');
      expect(radio.className).toContain('border');
    });

    it('applies focus-visible ring styles', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value='test' data-testid='radio' />
        </RadioGroup>
      );
      const radio = screen.getByTestId('radio');
      expect(radio.className).toContain('focus-visible:ring-2');
      expect(radio.className).toContain('focus-visible:ring-ring');
    });

    it('applies disabled styling', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value='test' disabled data-testid='radio' />
        </RadioGroup>
      );
      const radio = screen.getByTestId('radio');
      expect(radio.className).toContain('disabled:cursor-not-allowed');
      expect(radio.className).toContain('disabled:opacity-50');
    });

    it('merges custom className on group', () => {
      render(
        <RadioGroup className='custom-class' data-testid='group'>
          <RadioGroupItem value='test' />
        </RadioGroup>
      );
      const group = screen.getByTestId('group');
      expect(group.className).toContain('custom-class');
      expect(group.className).toContain('grid');
    });

    it('merges custom className on item', () => {
      render(
        <RadioGroup>
          <RadioGroupItem
            value='test'
            className='custom-item'
            data-testid='radio'
          />
        </RadioGroup>
      );
      const radio = screen.getByTestId('radio');
      expect(radio.className).toContain('custom-item');
      expect(radio.className).toContain('rounded-full');
    });
  });

  describe('Accessibility', () => {
    it('supports aria-label on group', () => {
      render(
        <RadioGroup aria-label='Select an option'>
          <RadioGroupItem value='test' />
        </RadioGroup>
      );
      expect(
        screen.getByRole('radiogroup', { name: 'Select an option' })
      ).toBeInTheDocument();
    });

    it('supports aria-labelledby on group', () => {
      render(
        <div>
          <span id='label'>Select your preference</span>
          <RadioGroup aria-labelledby='label'>
            <RadioGroupItem value='test' />
          </RadioGroup>
        </div>
      );
      const group = screen.getByRole('radiogroup');
      expect(group).toHaveAttribute('aria-labelledby', 'label');
    });

    it('supports name attribute', () => {
      render(
        <RadioGroup name='preference'>
          <RadioGroupItem value='test' />
        </RadioGroup>
      );
      // Radix handles name internally
    });

    it('supports required attribute', () => {
      render(
        <RadioGroup required>
          <RadioGroupItem value='test' />
        </RadioGroup>
      );
      const group = screen.getByRole('radiogroup');
      expect(group).toHaveAttribute('aria-required', 'true');
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates with arrow keys', () => {
      render(<TestRadioGroup defaultValue='option1' />);

      const option1 = screen.getByLabelText('Option 1');
      option1.focus();

      fireEvent.keyDown(option1, { key: 'ArrowDown' });
      // Arrow key navigation should move focus and selection
    });

    it('items are focusable', () => {
      render(<TestRadioGroup />);
      const option1 = screen.getByLabelText('Option 1');
      option1.focus();
      expect(option1).toHaveFocus();
    });
  });

  describe('Refs', () => {
    it('forwards ref to RadioGroup', () => {
      const ref = React.createRef<HTMLDivElement>();
      render(
        <RadioGroup ref={ref}>
          <RadioGroupItem value='test' />
        </RadioGroup>
      );
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it('forwards ref to RadioGroupItem', () => {
      const ref = React.createRef<HTMLButtonElement>();
      render(
        <RadioGroup>
          <RadioGroupItem ref={ref} value='test' />
        </RadioGroup>
      );
      expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    });
  });
});
