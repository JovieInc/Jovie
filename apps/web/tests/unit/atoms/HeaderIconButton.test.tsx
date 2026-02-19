import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { HeaderIconButton } from '@/components/atoms/HeaderIconButton';
import { expectNoA11yViolations } from '../../utils/a11y';

describe('HeaderIconButton', () => {
  it('renders with the provided aria-label', () => {
    render(
      <HeaderIconButton ariaLabel='Close dialog'>
        <svg aria-hidden='true' />
      </HeaderIconButton>
    );
    const button = screen.getByRole('button', { name: 'Close dialog' });
    expect(button).toBeInTheDocument();
  });

  it('renders children inside the button', () => {
    render(
      <HeaderIconButton ariaLabel='Settings'>
        <span data-testid='icon'>icon</span>
      </HeaderIconButton>
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies xs size class', () => {
    render(
      <HeaderIconButton ariaLabel='Action' size='xs'>
        <svg aria-hidden='true' />
      </HeaderIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('p-1');
  });

  it('applies sm size class', () => {
    render(
      <HeaderIconButton ariaLabel='Action' size='sm'>
        <svg aria-hidden='true' />
      </HeaderIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('p-1.5');
  });

  it('applies md size class by default', () => {
    render(
      <HeaderIconButton ariaLabel='Action'>
        <svg aria-hidden='true' />
      </HeaderIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('p-2');
  });

  it('applies custom className', () => {
    render(
      <HeaderIconButton ariaLabel='Action' className='custom-test'>
        <svg aria-hidden='true' />
      </HeaderIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('custom-test');
  });

  it('forwards ref to the underlying button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <HeaderIconButton ref={ref} ariaLabel='Ref test'>
        <svg aria-hidden='true' />
      </HeaderIconButton>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.getAttribute('aria-label')).toBe('Ref test');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <HeaderIconButton ariaLabel='Accessible button'>
        <svg aria-hidden='true' />
      </HeaderIconButton>
    );
    await expectNoA11yViolations(container);
  });
});
