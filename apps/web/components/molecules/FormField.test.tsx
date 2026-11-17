import { Input } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FormField } from './FormField';

describe('FormField', () => {
  it('labels its control and lets the user type into it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FormField label='Email Address'>
        <Input type='email' placeholder='you@example.com' />
      </FormField>
    );

    const input = screen.getByLabelText('Email Address');
    await user.type(input, 'tim@jov.ie');
    expect(input).toHaveValue('tim@jov.ie');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    await expectNoA11yViolations(container);
  });

  it('marks a required field as required', async () => {
    const { container } = render(
      <FormField label='Username' required>
        <Input />
      </FormField>
    );

    const input = screen.getByLabelText(/Username/);
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    await expectNoA11yViolations(container);
  });

  it('describes the control with its help text', async () => {
    const { container } = render(
      <FormField
        label='Handle'
        helpText='Only letters, numbers, and underscores.'
      >
        <Input />
      </FormField>
    );

    expect(screen.getByLabelText('Handle')).toHaveAccessibleDescription(
      'Only letters, numbers, and underscores.'
    );
    await expectNoA11yViolations(container);
  });

  it('announces an error, marks the control invalid and keeps the help text', async () => {
    const { container } = render(
      <FormField
        label='Display Name'
        required
        helpText='Shown on your public profile.'
        error='Display name is required.'
      >
        <Input />
      </FormField>
    );

    const input = screen.getByLabelText(/Display Name/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'Shown on your public profile. Display name is required.'
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Display name is required.'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps typed input and focus when an error appears and clears', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FormField label='Password'>
        <Input type='password' />
      </FormField>
    );
    const input = screen.getByLabelText('Password');
    await user.type(input, 'short');

    rerender(
      <FormField label='Password' error='Use at least 8 characters.'>
        <Input type='password' />
      </FormField>
    );
    expect(screen.getByLabelText('Password')).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('short');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    rerender(
      <FormField label='Password'>
        <Input type='password' />
      </FormField>
    );
    expect(input).toHaveValue('short');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses a provided id and preserves descriptions the control already owns', () => {
    render(
      <>
        <p id='handle-hint'>Visible on jov.ie</p>
        <FormField id='handle' label='Handle' helpText='Lowercase only.'>
          <Input aria-describedby='handle-hint' />
        </FormField>
      </>
    );

    const input = screen.getByLabelText('Handle');
    expect(input).toHaveAttribute('id', 'handle');
    expect(input).toHaveAttribute(
      'aria-describedby',
      'handle-hint handle-description'
    );
  });

  it('has no axe violations without a visible label when the control names itself', async () => {
    const { container } = render(
      <FormField helpText='We only use this to send sign-in codes.'>
        <Input aria-label='Email address' type='email' />
      </FormField>
    );

    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      'We only use this to send sign-in codes.'
    );
    await expectNoA11yViolations(container);
  });

  it('has no axe violations for long right-to-left copy', async () => {
    const { container } = render(
      <div dir='rtl'>
        <FormField
          label='اسم العرض الذي يظهر على ملفك الشخصي العام'
          helpText='يظهر هذا الاسم للمعجبين على صفحتك وفي روابط الإصدارات والجولات.'
          error='اسم العرض مطلوب ولا يمكن أن يتجاوز خمسين حرفًا.'
          required
        >
          <Input />
        </FormField>
      </div>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
