import { Select } from '@jovie/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockOptions = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3', disabled: true },
];

describe('Select', () => {
  afterEach(cleanup);

  it('renders correctly with default props', () => {
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(select).toHaveAttribute('data-state', 'closed');
  });

  it('renders with custom placeholder', () => {
    render(<Select options={mockOptions} placeholder='Choose an option' />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const placeholderText = screen.getByText('Choose an option');
    expect(placeholderText).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Select options={mockOptions} label='Select Option' />);

    expect(screen.getByText('Select Option')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders with required indicator', () => {
    render(<Select options={mockOptions} label='Select Option' required />);

    const label = screen.getByText('Select Option');
    expect(label).toBeInTheDocument();
    expect(label.parentElement).toHaveTextContent('*');
  });

  it('renders with error message', () => {
    render(<Select options={mockOptions} error='This field is required' />);

    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders all options when opened', async () => {
    const user = userEvent.setup();
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    
    // Open the select
    await user.click(select);
    
    // Wait for options to appear
    await waitFor(() => {
      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
      expect(screen.getByText('Option 3')).toBeInTheDocument();
    });
  });

  it('handles disabled options', async () => {
    const user = userEvent.setup();
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    
    // Open the select
    await user.click(select);
    
    // Wait for options to appear
    await waitFor(() => {
      const disabledOption = screen.getByText('Option 3');
      expect(disabledOption.closest('[role="option"]')).toHaveAttribute('data-disabled');
    });
  });

  it('handles value changes', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<Select options={mockOptions} onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    
    // Open the select
    await user.click(select);
    
    // Wait for options to appear and click one
    await waitFor(() => {
      const option = screen.getByText('Option 1');
      return user.click(option);
    });

    // Check if the change handler was called
    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledTimes(1);
    });
  });

  it('can be disabled', () => {
    render(<Select options={mockOptions} disabled />);

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
  });

  it('applies custom className', () => {
    render(<Select options={mockOptions} className='custom-select' />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('custom-select');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Select options={mockOptions} ref={ref} />);

    expect(ref).toHaveBeenCalled();
  });

  it('renders with error styling when error is provided', () => {
    render(<Select options={mockOptions} error='Error message' />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('border-red-500');
  });

  it('handles focus and blur events', () => {
    const handleFocus = vi.fn();
    const handleBlur = vi.fn();

    render(
      <Select options={mockOptions} onFocus={handleFocus} onBlur={handleBlur} />
    );

    const select = screen.getByRole('combobox');

    fireEvent.focus(select);
    expect(handleFocus).toHaveBeenCalledTimes(1);

    fireEvent.blur(select);
    expect(handleBlur).toHaveBeenCalledTimes(1);
  });

  it('renders with proper styling classes', () => {
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('flex', 'w-full', 'rounded-md');
  });

  it('renders with theme token classes', () => {
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass(
      'border-border-subtle',
      'bg-surface-1',
      'text-primary-token'
    );
  });

  it('handles empty options array', () => {
    render(<Select options={[]} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('supports size variants', () => {
    const { rerender } = render(<Select options={mockOptions} size="sm" />);
    
    let select = screen.getByRole('combobox');
    expect(select).toHaveClass('h-8');

    rerender(<Select options={mockOptions} size="lg" />);
    select = screen.getByRole('combobox');
    expect(select).toHaveClass('h-12');
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    
    // Focus the select
    await user.tab();
    expect(select).toHaveFocus();
    
    // Open with Enter
    await user.keyboard('{Enter}');
    
    // Check if options are visible
    await waitFor(() => {
      expect(screen.getByText('Option 1')).toBeInTheDocument();
    });
  });

  it('supports controlled state', () => {
    render(<Select options={mockOptions} value="option2" />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveAttribute('data-state', 'closed');
    // Note: In controlled state, the selected value would be displayed
    // This is a basic test to ensure the component accepts the value prop
  });
});
