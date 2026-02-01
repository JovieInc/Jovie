import { Button, Input } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Form } from '@/components/organisms/Form';

describe('Form', () => {
  it('renders children correctly', () => {
    render(
      <Form>
        <Input placeholder='Test input' />
        <Button>Submit</Button>
      </Form>
    );

    expect(screen.getByPlaceholderText('Test input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('handles form submission', () => {
    const handleSubmit = vi.fn();
    render(
      <Form onSubmit={handleSubmit}>
        <Input placeholder='Test input' />
        <Button type='submit'>Submit</Button>
      </Form>
    );

    const form = screen.getByRole('button').closest('form');
    fireEvent.submit(form!);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('prevents default form submission when onSubmit is provided', () => {
    const handleSubmit = vi.fn(e => {
      e.preventDefault();
    });

    render(
      <Form onSubmit={handleSubmit}>
        <Button type='submit'>Submit</Button>
      </Form>
    );

    const form = screen.getByRole('button').closest('form');
    fireEvent.submit(form!);

    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders with loading state', () => {
    render(
      <Form loading>
        <Input placeholder='Test input' />
      </Form>
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('renders with error message', () => {
    render(
      <Form error='Form submission failed'>
        <Input placeholder='Test input' />
      </Form>
    );

    expect(screen.getByText('Form submission failed')).toBeInTheDocument();
  });

  it('renders with success message', () => {
    render(
      <Form success='Form submitted successfully'>
        <Input placeholder='Test input' />
      </Form>
    );

    expect(screen.getByText('Form submitted successfully')).toBeInTheDocument();
  });

  it('renders with all status states', () => {
    render(
      <Form loading error='Error message' success='Success message'>
        <Input placeholder='Test input' />
      </Form>
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Form className='custom-form'>
        <Input placeholder='Test input' />
      </Form>
    );

    const form = screen.getByPlaceholderText('Test input').closest('form');
    expect(form).toHaveClass('custom-form');
  });

  it('applies default spacing classes', () => {
    render(
      <Form>
        <Input placeholder='Test input' />
      </Form>
    );

    const form = screen.getByPlaceholderText('Test input').closest('form');
    expect(form).toHaveClass('space-y-4');
  });

  it('forwards form attributes', () => {
    render(
      <Form method='post' action='/submit'>
        <Input placeholder='Test input' />
      </Form>
    );

    const form = screen.getByPlaceholderText('Test input').closest('form');
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('action', '/submit');
  });

  it('handles form without onSubmit', () => {
    render(
      <Form>
        <Button type='submit'>Submit</Button>
      </Form>
    );

    const form = screen.getByRole('button').closest('form');
    expect(() => fireEvent.submit(form!)).not.toThrow();
  });

  it('renders FormStatus component when status props are provided', () => {
    render(
      <Form loading error='Error' success='Success'>
        <Input placeholder='Test input' />
      </Form>
    );

    // FormStatus should be rendered as part of the form
    expect(screen.getByText('Processing...')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });
});
