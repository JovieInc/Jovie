import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogoIcon } from '@/components/atoms/LogoIcon';

vi.mock('@/components/atoms/BrandLogo', () => ({
  BrandLogo: ({ size, tone, alt, className }: any) => (
    <img
      src='/logo'
      alt={alt}
      data-size={size}
      data-tone={tone}
      className={className}
    />
  ),
}));

describe('LogoIcon', () => {
  it('renders an img element', () => {
    render(<LogoIcon />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('passes default size=48 to BrandLogo', () => {
    render(<LogoIcon />);
    expect(screen.getByRole('img')).toHaveAttribute('data-size', '48');
  });

  it('passes custom size prop to BrandLogo', () => {
    render(<LogoIcon size={64} />);
    expect(screen.getByRole('img')).toHaveAttribute('data-size', '64');
  });

  it('uses color variant by default', () => {
    render(<LogoIcon />);
    expect(screen.getByRole('img')).toHaveAttribute('data-tone', 'color');
  });

  it('passes black variant as tone="black"', () => {
    render(<LogoIcon variant='black' />);
    expect(screen.getByRole('img')).toHaveAttribute('data-tone', 'black');
  });

  it('passes white variant as tone="white"', () => {
    render(<LogoIcon variant='white' />);
    expect(screen.getByRole('img')).toHaveAttribute('data-tone', 'white');
  });

  it('passes custom className', () => {
    render(<LogoIcon className='my-icon' />);
    expect(screen.getByRole('img')).toHaveClass('my-icon');
  });
});
