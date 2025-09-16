import { Select } from '@jovie/ui';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    expect(select).toHaveValue('');
  });

  it('renders with custom placeholder', () => {
    render(<Select options={mockOptions} placeholder='Choose an option' />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    const placeholderOption = screen.getByText('Choose an option');
    expect(placeholderOption).toBeInTheDocument();
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
    expect(screen.getByText('This field is required')).toHaveClass(
      'text-red-600'
    );
  });

  it('renders all options', () => {
    render(<Select options={mockOptions} />);

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('handles disabled options', () => {
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    const options = select.querySelectorAll('option');

    // Check if the disabled option has the disabled attribute
    const disabledOption = Array.from(options).find(
      option => option.textContent === 'Option 3'
    );
    expect(disabledOption).toHaveAttribute('disabled');
  });

  it('handles value changes', () => {
    const handleChange = vi.fn();
    render(<Select options={mockOptions} onChange={handleChange} />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'option2' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(select).toHaveValue('option2');
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

  it('renders with proper default styling classes', () => {
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('block', 'w-full', 'rounded-md');
  });

  it('renders with dark mode classes', () => {
    render(<Select options={mockOptions} />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass(
      'dark:border-gray-600',
      'dark:bg-gray-800',
      'dark:text-gray-50'
    );
  });

  it('handles empty options array', () => {
    render(<Select options={[]} />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    // Should only have the placeholder option
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(1);
  });
});
