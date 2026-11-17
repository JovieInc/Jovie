import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

  it('uses a 16px, 44px mobile field and the Pen 40px desktop field', () => {
    render(<AuthTextInput aria-label='Email address' />);

    const input = screen.getByRole('textbox', { name: 'Email address' });

    expect(input.className).toContain('h-11');
    expect(input.className).toContain('min-h-11');
    expect(input.className).toContain('text-base');
    expect(input.className).toContain('sm:h-10');
    expect(input.className).toContain('sm:min-h-10');
    expect(input.className).toContain('sm:text-sm');
    expect(input.className).not.toContain('sm:h-8');
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

  it('keeps typed input and focus through a parent rerender, Escape and blur', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AuthTextInput aria-label='Email address' placeholder='you@example.com' />
    );
    const input = screen.getByRole('textbox', { name: 'Email address' });

    await user.type(input, 'artist@jov.ie');
    rerender(
      <AuthTextInput
        aria-label='Email address'
        placeholder='you@example.com'
        aria-invalid
      />
    );

    expect(screen.getByRole('textbox', { name: 'Email address' })).toBe(input);
    expect(input).toHaveValue('artist@jov.ie');
    expect(input).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(input).toHaveValue('artist@jov.ie');
    expect(input).toHaveFocus();

    await user.tab();
    expect(input).not.toHaveFocus();
    expect(input).toHaveValue('artist@jov.ie');
  });

  it('has no axe violations for the default, otp, disabled and invalid fields', async () => {
    const { container } = render(
      <form>
        <AuthTextInput aria-label='Email address' type='email' />
        <AuthTextInput aria-label='One-time code' variant='otp' />
        <AuthTextInput aria-label='Name' defaultValue='Tim' disabled />
        <AuthTextInput aria-label='Handle' aria-invalid defaultValue='@@' />
      </form>
    );

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for long right-to-left content', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AuthTextInput
          aria-label='البريد الإلكتروني'
          defaultValue='booking.and.management.team.for.the.collective@example-records-group.com'
        />
      </div>
    );

    expect(
      screen.getByRole('textbox', { name: 'البريد الإلكتروني' })
    ).toHaveValue(
      'booking.and.management.team.for.the.collective@example-records-group.com'
    );
    await expectNoA11yViolations(container);
  });
});
