import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthFormContainer } from './AuthFormContainer';

describe('AuthFormContainer certificate', () => {
  it('renders its children full width', async () => {
    const { container } = render(
      <AuthFormContainer>
        <p>Enter your email to continue</p>
      </AuthFormContainer>
    );

    const body = screen.getByText('Enter your email to continue');
    expect(body.parentElement).toHaveClass('w-full');
    await expectNoA11yViolations(container);
  });

  it('merges a caller class with the base width', async () => {
    const { container } = render(
      <AuthFormContainer className='max-w-sm'>
        <p>Body</p>
      </AuthFormContainer>
    );

    expect(screen.getByText('Body').parentElement).toHaveClass(
      'w-full',
      'max-w-sm'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left content whole', async () => {
    const long =
      'We sent a six digit code to the address you entered. It can take a minute or two to arrive.';
    const { container } = render(
      <div dir='rtl'>
        <AuthFormContainer>
          <p>{long}</p>
        </AuthFormContainer>
      </div>
    );

    expect(screen.getByText(long)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
