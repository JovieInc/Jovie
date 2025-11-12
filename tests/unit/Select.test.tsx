import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Select Component Tests (Radix UI)
 *
 * Tests the Radix UI Select compound component pattern.
 * Select uses a portal for dropdown content, requiring specific testing approaches.
 */
describe('Select (Radix UI)', () => {
  afterEach(cleanup);

  it('renders trigger with placeholder text', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder='Select an option' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Select an option');
  });

  it('opens dropdown when trigger is clicked', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
          <SelectItem value='option2'>Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Items should be visible after opening
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Option 1' })).toBeVisible();
    });
    expect(screen.getByRole('option', { name: 'Option 2' })).toBeVisible();
  });

  it('selects an item when clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
          <SelectItem value='option2'>Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    // Open dropdown
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Click option
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Option 2' })).toBeVisible();
    });
    await user.click(screen.getByRole('option', { name: 'Option 2' }));

    // Verify callback was called
    expect(onValueChange).toHaveBeenCalledWith('option2');
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('displays selected value in trigger', async () => {
    render(
      <Select defaultValue='option1'>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
          <SelectItem value='option2'>Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Option 1');
  });

  it('renders disabled trigger correctly', () => {
    render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();
  });

  it('renders disabled items correctly', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
          <SelectItem value='option2' disabled>
            Option 2 (Disabled)
          </SelectItem>
        </SelectContent>
      </Select>
    );

    // Open dropdown
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    await waitFor(() => {
      const disabledOption = screen.getByRole('option', {
        name: 'Option 2 (Disabled)',
      });
      expect(disabledOption).toBeVisible();
      expect(disabledOption).toHaveAttribute('data-disabled');
    });

    // Attempt to click disabled item
    const disabledOption = screen.getByRole('option', {
      name: 'Option 2 (Disabled)',
    });
    await user.click(disabledOption);

    // Should not trigger value change
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('renders with groups and labels', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder='Choose fruit' />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value='apple'>Apple</SelectItem>
            <SelectItem value='banana'>Banana</SelectItem>
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Vegetables</SelectLabel>
            <SelectItem value='carrot'>Carrot</SelectItem>
            <SelectItem value='potato'>Potato</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );

    // Open dropdown
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Check for group labels
    await waitFor(() => {
      expect(screen.getByText('Fruits')).toBeVisible();
      expect(screen.getByText('Vegetables')).toBeVisible();
    });

    // Check for items
    expect(screen.getByRole('option', { name: 'Apple' })).toBeVisible();
    expect(screen.getByRole('option', { name: 'Carrot' })).toBeVisible();
  });

  it('supports controlled value changes', async () => {
    const user = userEvent.setup();
    const TestComponent = () => {
      const [value, setValue] = React.useState('option1');

      return (
        <>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='option1'>Option 1</SelectItem>
              <SelectItem value='option2'>Option 2</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={() => setValue('option2')}>Set Option 2</button>
        </>
      );
    };

    render(<TestComponent />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Option 1');

    // Click button to change value
    await user.click(screen.getByRole('button', { name: 'Set Option 2' }));

    expect(trigger).toHaveTextContent('Option 2');
  });

  it('supports keyboard accessibility attributes', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
          <SelectItem value='option2'>Option 2</SelectItem>
          <SelectItem value='option3'>Option 3</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');

    // Verify keyboard accessibility attributes
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-autocomplete', 'none');
    expect(trigger).toHaveAttribute('data-state', 'closed');
  });

  it('closes dropdown when Escape is pressed', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
          <SelectItem value='option2'>Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    // Open dropdown
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Option 1' })).toBeVisible();
    });

    // Press Escape
    await user.keyboard('{Escape}');

    // Dropdown should close
    await waitFor(() => {
      expect(
        screen.queryByRole('option', { name: 'Option 1' })
      ).not.toBeInTheDocument();
    });
  });

  it('applies custom className to trigger', () => {
    render(
      <Select>
        <SelectTrigger className='custom-trigger-class'>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveClass('custom-trigger-class');
  });

  it('applies custom className to items', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1' className='custom-item-class'>
            Option 1
          </SelectItem>
        </SelectContent>
      </Select>
    );

    // Open dropdown
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    await waitFor(() => {
      const item = screen.getByRole('option', { name: 'Option 1' });
      expect(item).toHaveClass('custom-item-class');
    });
  });

  it('renders empty state correctly', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder='No options available' />
        </SelectTrigger>
        <SelectContent>{/* No items */}</SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('No options available');
  });

  it('renders with required attribute', () => {
    render(
      <Select required>
        <SelectTrigger>
          <SelectValue placeholder='Choose' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='option1'>Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-required', 'true');
  });
});
