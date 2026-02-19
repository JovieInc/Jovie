import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { expectNoA11yViolations } from '../../utils/a11y';

describe('CircleIconButton', () => {
  it('renders with the provided aria-label', () => {
    render(
      <CircleIconButton ariaLabel='Go back'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Go back' });
    expect(button).toBeInTheDocument();
  });

  it('renders children inside the button', () => {
    render(
      <CircleIconButton ariaLabel='Menu'>
        <span data-testid='menu-icon'>menu</span>
      </CircleIconButton>
    );
    expect(screen.getByTestId('menu-icon')).toBeInTheDocument();
  });

  it('applies xs size classes', () => {
    render(
      <CircleIconButton ariaLabel='Action' size='xs'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('h-8', 'w-8');
  });

  it('applies sm size classes by default', () => {
    render(
      <CircleIconButton ariaLabel='Action'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('h-9', 'w-9');
  });

  it('applies md size classes', () => {
    render(
      <CircleIconButton ariaLabel='Action' size='md'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('h-10', 'w-10');
  });

  it('applies lg size classes', () => {
    render(
      <CircleIconButton ariaLabel='Action' size='lg'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('h-11', 'w-11');
  });

  it('applies ghost variant classes', () => {
    render(
      <CircleIconButton ariaLabel='Action' variant='ghost'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('bg-transparent');
  });

  it('renders as child element when asChild is true', () => {
    render(
      <CircleIconButton ariaLabel='Link button' asChild>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- test only */}
        <a href='/profile'>Back</a>
      </CircleIconButton>
    );
    const link = screen.getByRole('link', { name: 'Link button' });
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(
      <CircleIconButton ariaLabel='Click me' onClick={handleClick}>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Click me' }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('forwards ref to the underlying button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <CircleIconButton ref={ref} ariaLabel='Ref test'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('applies custom className', () => {
    render(
      <CircleIconButton ariaLabel='Action' className='my-custom-class'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveClass('my-custom-class');
  });

  it('has type="button" by default', () => {
    render(
      <CircleIconButton ariaLabel='Action'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <CircleIconButton ariaLabel='Accessible circle button'>
        <svg aria-hidden='true' />
      </CircleIconButton>
    );
    await expectNoA11yViolations(container);
  });
});
