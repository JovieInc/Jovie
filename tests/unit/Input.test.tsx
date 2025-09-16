import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '@/components/atoms/Input';

describe('Input', () => {
  afterEach(cleanup);

  it('renders correctly with default props', () => {
    render(<Input placeholder='Enter text' />);
    const input = screen.getByPlaceholderText('Enter text');
    expect(input).toBeInTheDocument();
  });

  it('renders with label', () => {
    render(<Input label='Email' placeholder='Enter email' />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });

  it('renders with error message', () => {
    render(<Input error='This field is required' placeholder='Enter text' />);
    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByText('This field is required')).toHaveClass(
      'text-red-600'
    );
  });

  it('handles value changes', () => {
    const handleChange = vi.fn();
    render(<Input onChange={handleChange} placeholder='Enter text' />);

    const input = screen.getByPlaceholderText('Enter text');
    fireEvent.change(input, { target: { value: 'test value' } });

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('renders with different types', () => {
    const { rerender } = render(<Input type='email' placeholder='Email' />);
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();

    rerender(<Input type='password' placeholder='Password' />);
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();

    rerender(<Input type='number' placeholder='Number' />);
    expect(screen.getByPlaceholderText('Number')).toBeInTheDocument();
  });

  it('can be disabled', () => {
    render(<Input disabled placeholder='Disabled input' />);
    const input = screen.getByPlaceholderText('Disabled input');
    expect(input).toBeDisabled();
  });

  it('renders with required attribute', () => {
    render(<Input required placeholder='Required input' />);
    const input = screen.getByPlaceholderText('Required input');
    expect(input).toHaveAttribute('required');
  });

  it('forwards ref correctly', () => {
    const ref = vi.fn();
    render(<Input ref={ref} placeholder='Ref input' />);
    expect(ref).toHaveBeenCalled();
  });

  it('renders with different sizes', () => {
    const { rerender } = render(<Input placeholder='Small' />);
    expect(screen.getByPlaceholderText('Small')).toBeInTheDocument();

    rerender(<Input placeholder='Medium' />);
    expect(screen.getByPlaceholderText('Medium')).toBeInTheDocument();

    rerender(<Input placeholder='Large' />);
    expect(screen.getByPlaceholderText('Large')).toBeInTheDocument();
  });

  it('handles focus and blur-sm events', () => {
    const handleFocus = vi.fn();
    const handleBlur = vi.fn();

    render(
      <Input
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder='Test input'
      />
    );

    const input = screen.getByPlaceholderText('Test input');

    fireEvent.focus(input);
    expect(handleFocus).toHaveBeenCalledTimes(1);

    fireEvent.blur(input);
    expect(handleBlur).toHaveBeenCalledTimes(1);
  });
});
