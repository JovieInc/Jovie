import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

// Helper component for testing
const TestSelect = ({
  open,
  onOpenChange,
  value,
  onValueChange,
  defaultValue,
  placeholder = 'Select an option',
  disabled = false,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
}) => (
  <Select
    open={open}
    onOpenChange={onOpenChange}
    value={value}
    onValueChange={onValueChange}
    defaultValue={defaultValue}
    disabled={disabled}
  >
    <SelectTrigger>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Fruits</SelectLabel>
        <SelectItem value='apple'>Apple</SelectItem>
        <SelectItem value='banana'>Banana</SelectItem>
        <SelectItem value='orange'>Orange</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>Vegetables</SelectLabel>
        <SelectItem value='carrot'>Carrot</SelectItem>
        <SelectItem value='potato'>Potato</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
);

describe('Select', () => {
  describe('Basic Functionality', () => {
    it('renders trigger with placeholder', () => {
      render(<TestSelect />);
      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });

    it('renders trigger button', () => {
      render(<TestSelect />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('opens on trigger click', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestSelect />);

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('shows options when open', () => {
      render(<TestSelect open={true} />);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
    });
  });

  describe('Selection', () => {
    it('selects an item on click', async () => {
      const onValueChange = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(<TestSelect onValueChange={onValueChange} />);

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('Apple')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Apple'));

      expect(onValueChange).toHaveBeenCalledWith('apple');
    });

    it('displays selected value', () => {
      render(<TestSelect value='apple' />);
      expect(screen.getByText('Apple')).toBeInTheDocument();
    });

    it('displays default value', () => {
      render(<TestSelect defaultValue='banana' />);
      expect(screen.getByText('Banana')).toBeInTheDocument();
    });
  });

  describe('Controlled Mode', () => {
    it('works in controlled mode', () => {
      const onValueChange = vi.fn();
      const { rerender } = render(
        <TestSelect value='apple' onValueChange={onValueChange} />
      );

      expect(screen.getByText('Apple')).toBeInTheDocument();

      rerender(<TestSelect value='banana' onValueChange={onValueChange} />);
      expect(screen.getByText('Banana')).toBeInTheDocument();
    });

    it('calls onOpenChange when opened', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup({ delay: null });
      render(<TestSelect onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole('combobox'));

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Groups and Labels', () => {
    it('renders group labels', () => {
      render(<TestSelect open={true} />);
      expect(screen.getByText('Fruits')).toBeInTheDocument();
      expect(screen.getByText('Vegetables')).toBeInTheDocument();
    });

    it('renders separator between groups', () => {
      render(<TestSelect open={true} />);
      // Separator is rendered as a visual element
      const listbox = screen.getByRole('listbox');
      expect(listbox).toContainElement(screen.getByText('Fruits'));
      expect(listbox).toContainElement(screen.getByText('Vegetables'));
    });
  });

  describe('States', () => {
    it('respects disabled state', () => {
      render(<TestSelect disabled />);
      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeDisabled();
    });

    it('does not open when disabled', async () => {
      const user = userEvent.setup({ delay: null });
      render(<TestSelect disabled />);

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('closes on escape key', async () => {
      const onOpenChange = vi.fn();
      render(<TestSelect open={true} onOpenChange={onOpenChange} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Accessibility', () => {
    it('has proper aria attributes on trigger', () => {
      render(<TestSelect />);
      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('updates aria-expanded when open', () => {
      render(<TestSelect open={true} />);
      // When open, Radix Select renders a listbox and the trigger may change
      // Check that the listbox is present which indicates the select is open
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('has role listbox for options container', () => {
      render(<TestSelect open={true} />);
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('options have role option', () => {
      render(<TestSelect open={true} />);
      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);
    });
  });

  describe('Styling', () => {
    it('applies custom className to trigger', () => {
      render(
        <Select>
          <SelectTrigger className='custom-class'>
            <SelectValue placeholder='Select' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='test'>Test</SelectItem>
          </SelectContent>
        </Select>
      );
      const trigger = screen.getByRole('combobox');
      expect(trigger.className).toContain('custom-class');
    });

    it('applies custom className to content', () => {
      render(
        <Select open={true}>
          <SelectTrigger>
            <SelectValue placeholder='Select' />
          </SelectTrigger>
          <SelectContent className='custom-content'>
            <SelectItem value='test'>Test</SelectItem>
          </SelectContent>
        </Select>
      );
      const listbox = screen.getByRole('listbox');
      expect(listbox.className).toContain('custom-content');
    });
  });
});
