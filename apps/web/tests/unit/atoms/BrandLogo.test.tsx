import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('next/image', () => ({
  // eslint-disable-next-line jsx-a11y/alt-text -- test mock, props passed through
  default: (props: any) => <img {...props} />,
}));

describe('BrandLogo', () => {
  it('renders with default alt text', () => {
    render(<BrandLogo tone='white' />);
    const img = screen.getByAltText('Jovie');
    expect(img).toBeInTheDocument();
  });

  it('renders with custom alt text', () => {
    render(<BrandLogo tone='white' alt='Custom Logo' />);
    expect(screen.getByAltText('Custom Logo')).toBeInTheDocument();
  });

  it('renders white tone with correct src', () => {
    render(<BrandLogo tone='white' />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveAttribute('src', '/brand/Jovie-Logo-Icon-White.svg');
  });

  it('renders black tone with correct src', () => {
    render(<BrandLogo tone='black' />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveAttribute('src', '/brand/Jovie-Logo-Icon-Black.svg');
  });

  it('renders color tone with correct src', () => {
    render(<BrandLogo tone='color' />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveAttribute('src', '/brand/Jovie-Logo-Icon.svg');
  });

  it('renders two images for auto tone (dark/light variants)', () => {
    render(<BrandLogo tone='auto' />);
    const images = screen.getAllByAltText('Jovie');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute(
      'src',
      '/brand/Jovie-Logo-Icon-Black.svg'
    );
    expect(images[1]).toHaveAttribute(
      'src',
      '/brand/Jovie-Logo-Icon-White.svg'
    );
  });

  it('renders two images by default (auto is the default tone)', () => {
    render(<BrandLogo />);
    const images = screen.getAllByAltText('Jovie');
    expect(images).toHaveLength(2);
  });

  it('applies size to width and height', () => {
    render(<BrandLogo tone='white' size={64} />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveAttribute('width', '64');
    expect(img).toHaveAttribute('height', '64');
  });

  it('uses default size of 48', () => {
    render(<BrandLogo tone='white' />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveAttribute('width', '48');
    expect(img).toHaveAttribute('height', '48');
  });

  it('applies rounded-full class when rounded=true (default)', () => {
    render(<BrandLogo tone='white' />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveClass('rounded-full');
  });

  it('does not apply rounded-full class when rounded=false', () => {
    render(<BrandLogo tone='white' rounded={false} />);
    const img = screen.getByAltText('Jovie');
    expect(img).not.toHaveClass('rounded-full');
  });

  it('applies custom className', () => {
    render(<BrandLogo tone='white' className='my-logo' />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveClass('my-logo');
  });

  it('applies aria-hidden attribute', () => {
    render(<BrandLogo tone='white' aria-hidden />);
    const img = screen.getByAltText('Jovie');
    expect(img).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes a11y checks', async () => {
    const { container } = render(<BrandLogo tone='white' />);
    await expectNoA11yViolations(container);
  });
});
