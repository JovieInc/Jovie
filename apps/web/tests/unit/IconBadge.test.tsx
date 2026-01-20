import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconBadge } from '@/components/atoms/IconBadge';

describe('IconBadge', () => {
  it('renders icon with correct styling', () => {
    const { container } = render(
      <IconBadge name='Bolt' colorVar='--accent-speed' />
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).not.toHaveAttribute('role');
    const iconContainer = icon?.parentElement;
    expect(iconContainer).toHaveClass('h-8', 'w-8', 'rounded-full');
  });

  it('applies custom className', () => {
    const { container } = render(
      <IconBadge
        name='Bolt'
        colorVar='--accent-speed'
        className='custom-class'
      />
    );

    const iconContainer = container.firstChild as HTMLElement;
    expect(iconContainer).toHaveClass('custom-class');
  });

  it('uses aria-label when provided', () => {
    render(
      <IconBadge name='Bolt' colorVar='--accent-speed' ariaLabel='Bolt icon' />
    );

    const icon = screen.getByLabelText('Bolt icon');
    expect(icon).not.toHaveAttribute('role');
    expect(icon).toHaveAttribute('aria-hidden', 'false');
  });
});
