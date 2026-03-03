import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { LinearButton } from '@/components/atoms/LinearButton';
import { expectNoA11yViolations } from '../../utils/a11y';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('LinearButton', () => {
  it('renders as a link with correct href', () => {
    render(<LinearButton href='/test'>Click me</LinearButton>);
    const link = screen.getByRole('link', { name: 'Click me' });
    expect(link).toHaveAttribute('href', '/test');
  });

  it('renders children', () => {
    render(<LinearButton href='/x'>Hello World</LinearButton>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('applies primary variant classes by default', () => {
    render(<LinearButton href='/x'>Primary</LinearButton>);
    const link = screen.getByRole('link', { name: 'Primary' });
    expect(link.className).toContain('hover:opacity-90');
  });

  it('applies secondary variant classes', () => {
    render(
      <LinearButton href='/x' variant='secondary'>
        Secondary
      </LinearButton>
    );
    const link = screen.getByRole('link', { name: 'Secondary' });
    expect(link.className).toContain('hover:opacity-80');
  });

  it('applies ghost variant classes', () => {
    render(
      <LinearButton href='/x' variant='ghost'>
        Ghost
      </LinearButton>
    );
    const link = screen.getByRole('link', { name: 'Ghost' });
    expect(link.className).toContain('gap-1.5');
  });

  it('forwards custom className', () => {
    render(
      <LinearButton href='/x' className='my-custom-class'>
        Custom
      </LinearButton>
    );
    const link = screen.getByRole('link', { name: 'Custom' });
    expect(link.className).toContain('my-custom-class');
  });

  it('forwards ref to anchor element', () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <LinearButton ref={ref} href='/x'>
        Ref test
      </LinearButton>
    );
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <LinearButton href='/x'>Accessible</LinearButton>
    );
    await expectNoA11yViolations(container);
  });
});
