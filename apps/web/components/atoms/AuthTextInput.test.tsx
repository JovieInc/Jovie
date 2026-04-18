import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { AuthTextInput } from './AuthTextInput';

describe('AuthTextInput', () => {
  it('renders a default text input and updates its value', () => {
    render(
      <AuthTextInput
        aria-label='Email address'
        defaultValue=''
        placeholder='you@example.com'
      />
    );

    const input = screen.getByRole('textbox', { name: 'Email address' });
    fireEvent.change(input, { target: { value: 'fan@jovie.fm' } });

    expect(input).toHaveValue('fan@jovie.fm');
  });

  it('applies the otp variant classes', () => {
    render(<AuthTextInput aria-label='One-time code' variant='otp' />);

    const input = screen.getByRole('textbox', { name: 'One-time code' });

    expect(input.className).toContain('text-2xl');
    expect(input.className).toContain('text-center');
    expect(input.className).toContain('tracking-[0.3em]');
  });

  it('forwards refs to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<AuthTextInput ref={ref} aria-label='Password' />);

    ref.current?.focus();

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current).toBe(document.activeElement);
  });

  it('passes custom className values through to the input', () => {
    render(
      <AuthTextInput aria-label='Artist name' className='data-[test=auth]' />
    );

    expect(
      screen.getByRole('textbox', { name: 'Artist name' }).className
    ).toContain('data-[test=auth]');
  });
});
