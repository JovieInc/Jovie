import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SocialIcon } from '@/components/atoms/SocialIcon';
import { expectNoA11yViolations } from '../../utils/a11y';

describe('SocialIcon', () => {
  it('renders an SVG for a known platform', () => {
    const { container } = render(<SocialIcon platform='instagram' />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
  });

  it('renders a path element for a known platform', () => {
    const { container } = render(<SocialIcon platform='spotify' />);
    const path = container.querySelector('path');
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute('d')).toBeTruthy();
  });

  it('applies className to the SVG', () => {
    const { container } = render(
      <SocialIcon platform='instagram' className='h-6 w-6 text-red-500' />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-6', 'w-6', 'text-red-500');
  });

  it('uses default className when none provided', () => {
    const { container } = render(<SocialIcon platform='instagram' />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-4', 'w-4');
  });

  it('applies size as inline style', () => {
    const { container } = render(<SocialIcon platform='instagram' size={32} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveStyle({ width: '32px', height: '32px' });
  });

  it('handles unknown platform with fallback icon', () => {
    const { container } = render(<SocialIcon platform='unknownplatform' />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Fallback uses stroke instead of fill
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
  });

  it('is aria-hidden by default', () => {
    const { container } = render(<SocialIcon platform='instagram' />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders with aria-label and role="img" when provided', () => {
    const { container } = render(
      <SocialIcon
        platform='instagram'
        aria-hidden={false}
        aria-label='Instagram icon'
      />
    );
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-label', 'Instagram icon');
    expect(svg).toHaveAttribute('role', 'img');
  });

  it('does not set role="img" when no aria-label is provided', () => {
    const { container } = render(<SocialIcon platform='instagram' />);
    const svg = container.querySelector('svg');
    expect(svg).not.toHaveAttribute('role');
  });

  it('handles case-insensitive platform names', () => {
    const { container } = render(<SocialIcon platform='Instagram' />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it('has no accessibility violations when aria-hidden', async () => {
    const { container } = render(
      <SocialIcon platform='instagram' aria-hidden={true} />
    );
    await expectNoA11yViolations(container);
  });

  it('has no accessibility violations when labelled', async () => {
    const { container } = render(
      <SocialIcon
        platform='instagram'
        aria-hidden={false}
        aria-label='Instagram'
      />
    );
    await expectNoA11yViolations(container);
  });
});
