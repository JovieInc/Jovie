import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '@/components/atoms/Icon';

describe('Icon', () => {
  it('renders specified icon', () => {
    render(<Icon name='AlarmClock' data-testid='icon' />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('applies className and size props', () => {
    render(
      <Icon
        name='Activity'
        data-testid='icon'
        className='text-red-500'
        size={32}
      />
    );
    const icon = screen.getByTestId('icon');
    expect(icon).toHaveClass('text-red-500');
    expect(icon).toHaveAttribute('width', '32');
    expect(icon).toHaveAttribute('height', '32');
  });

  it('normalizes various icon name formats', () => {
    render(<Icon name='alarm-clock' data-testid='kebab' />);
    expect(screen.getByTestId('kebab')).toBeInTheDocument();

    render(<Icon name='ActivityIcon' data-testid='suffix' />);
    expect(screen.getByTestId('suffix')).toBeInTheDocument();
  });

  it('returns null for unknown icon', () => {
    const { container } = render(
      <Icon name={'NotRealIcon' as any} data-testid='icon' />
    );
    expect(container.firstChild).toBeNull();
  });
});
