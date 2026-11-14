import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FormError } from './FormError';

describe('FormError', () => {
  it.each([undefined, null, ''])('renders nothing for message %p', message => {
    const { container } = render(<FormError message={message} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the message as an alert', async () => {
    const { container } = render(
      <FormError message='That email address is already in use.' />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('That email address is already in use.');
    expect(alert).toHaveAttribute('aria-live', 'polite');
    await expectNoA11yViolations(container);
  });

  it('describes the field it belongs to through its id', async () => {
    const { container } = render(
      <form>
        <label htmlFor='email'>Email</label>
        <input
          id='email'
          type='email'
          aria-invalid='true'
          aria-describedby='email-error'
        />
        <FormError id='email-error' message='Enter a valid email address.' />
      </form>
    );

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address.'
    );
    await expectNoA11yViolations(container);
  });

  it('merges caller classes with the auth field error style', () => {
    render(<FormError message='Code expired.' className='mt-2' />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('mt-2', 'text-error-text', 'text-xs');
  });

  it('removes the alert when the message clears', () => {
    const { rerender } = render(<FormError message='Code expired.' />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<FormError message={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has no axe violations for a long right-to-left message', async () => {
    const { container } = render(
      <div dir='rtl'>
        <FormError message='انتهت صلاحية رمز التحقق. اطلب رمزًا جديدًا وأدخله خلال عشر دقائق للمتابعة.' />
      </div>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
