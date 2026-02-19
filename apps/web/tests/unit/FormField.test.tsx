import { Input } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from '@/components/molecules/FormField';

describe('FormField', () => {
  it('renders correctly with label', () => {
    render(
      <FormField label='Email'>
        <Input placeholder='Enter email' />
      </FormField>
    );

    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter email')).toBeInTheDocument();
  });

  it('renders without label', () => {
    render(
      <FormField>
        <Input placeholder='Enter text' />
      </FormField>
    );

    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('renders with required indicator', () => {
    render(
      <FormField label='Email' required>
        <Input placeholder='Enter email' />
      </FormField>
    );

    const label = screen.getByText('Email');
    expect(label).toBeInTheDocument();
    expect(label.parentElement).toHaveTextContent('*');
  });

  it('renders with error message', () => {
    render(
      <FormField label='Email' error='This field is required'>
        <Input placeholder='Enter email' />
      </FormField>
    );

    expect(screen.getByText('This field is required')).toBeInTheDocument();
    expect(screen.getByText('This field is required')).toHaveClass(
      'text-destructive'
    );
  });

  it('renders with custom className', () => {
    render(
      <FormField label='Email' className='custom-field'>
        <Input placeholder='Enter email' />
      </FormField>
    );

    const fieldContainer = screen.getByText('Email').closest('div');
    expect(fieldContainer).toHaveClass('custom-field');
  });

  it('renders children correctly', () => {
    render(
      <FormField label='Test'>
        <div data-testid='custom-child'>Custom content</div>
      </FormField>
    );

    expect(screen.getByTestId('custom-child')).toBeInTheDocument();
    expect(screen.getByText('Custom content')).toBeInTheDocument();
  });

  it('handles multiple children', () => {
    render(
      <FormField label='Multiple'>
        <Input placeholder='First input' />
        <Input placeholder='Second input' />
      </FormField>
    );

    expect(screen.getByPlaceholderText('First input')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Second input')).toBeInTheDocument();
  });

  it('applies proper spacing classes', () => {
    render(
      <FormField label='Test'>
        <Input placeholder='Test input' />
      </FormField>
    );

    const fieldContainer = screen.getByText('Test').closest('div');
    expect(fieldContainer).toHaveClass('space-y-2');
  });
});
