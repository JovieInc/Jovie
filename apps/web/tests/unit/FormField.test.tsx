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

  it('preserves child-owned describedby ids', () => {
    render(
      <FormField label='Multiple IDs' helpText='External help' id='field-id'>
        <Input placeholder='Input with external help' aria-describedby='hint' />
      </FormField>
    );

    expect(
      screen.getByPlaceholderText('Input with external help')
    ).toHaveAttribute('aria-describedby', 'hint field-id-description');
  });

  it('applies proper spacing classes', () => {
    render(
      <FormField label='Test'>
        <Input placeholder='Test input' />
      </FormField>
    );

    const fieldContainer = screen.getByText('Test').closest('div');
    expect(fieldContainer).toHaveClass('grid', 'gap-1.5');
    expect(fieldContainer).toHaveAttribute('data-slot', 'field');
  });

  it('reserves feedback space before and after an inline error appears', () => {
    const { container, rerender } = render(
      <FormField label='Email' id='email'>
        <Input placeholder='Enter email' />
      </FormField>
    );

    const feedbackSlot = container.querySelector(
      '[data-slot="field-feedback"]'
    );
    expect(feedbackSlot).toHaveClass('min-h-5');
    expect(feedbackSlot).toBeEmptyDOMElement();

    rerender(
      <FormField label='Email' id='email' error='This field is required'>
        <Input placeholder='Enter email' />
      </FormField>
    );

    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('This field is required');
    // The reserved feedback wrapper stays semantics-free: the error's
    // role="alert" announces itself (mirrors packages/ui field.test.tsx).
    expect(error.parentElement).toHaveAttribute('data-slot', 'field-feedback');
    expect(error.parentElement).not.toHaveAttribute('aria-live');
    expect(error.parentElement).not.toHaveAttribute('aria-atomic');
    expect(error).not.toHaveAttribute('aria-live');
  });
});
