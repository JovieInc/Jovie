import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { BRAND_PATHS, JOVIE_PATH, JOVIE_VIEWBOX } from '@/lib/brand/tokens';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

describe('BrandLogo', () => {
  it('renders a single svg element inside a span wrapper', () => {
    const { container } = render(<BrandLogo />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    const wrapper = container.querySelector('span');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.querySelector('svg')).toBe(svgs[0]);
  });

  it('renders with default aria-label "Jovie" on svg', () => {
    render(<BrandLogo />);
    expect(screen.getByLabelText('Jovie')).toBeInTheDocument();
  });

  it('renders with custom alt text as aria-label', () => {
    render(<BrandLogo alt='Custom Logo' />);
    expect(screen.getByLabelText('Custom Logo')).toBeInTheDocument();
  });

  it('renders a title element inside svg for accessibility', () => {
    const { container } = render(<BrandLogo />);
    const title = container.querySelector('svg title');
    expect(title).toBeInTheDocument();
    expect(title?.textContent).toBe('Jovie');
  });

  it('omits title element when aria-hidden', () => {
    const { container } = render(<BrandLogo aria-hidden />);
    const title = container.querySelector('svg title');
    expect(title).not.toBeInTheDocument();
  });

  it('renders auto tone with no inline color style on wrapper', () => {
    const { container } = render(<BrandLogo tone='auto' />);
    const wrapper = container.querySelector('span');
    expect(wrapper).not.toHaveStyle({ color: 'var(--color-accent)' });
    expect(wrapper).not.toHaveClass('text-white');
    expect(wrapper).not.toHaveClass('text-accent');
  });

  it('renders white tone with token-backed class on wrapper', () => {
    const { container } = render(<BrandLogo tone='white' />);
    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveClass('text-white');
  });

  it('renders color tone with accent token class on wrapper', () => {
    const { container } = render(<BrandLogo tone='color' />);
    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveClass('text-accent');
  });

  it('renders muted tone with muted class on wrapper', () => {
    const { container } = render(<BrandLogo tone='muted' />);
    const wrapper = container.querySelector('span');
    expect(wrapper?.getAttribute('class')).toContain(
      'text-muted-foreground/50'
    );
  });

  it('applies size to width and height attributes on svg', () => {
    const { container } = render(<BrandLogo size={64} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });

  it('uses default size of 48', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });

  it('applies rounded-full class on wrapper when rounded=true (default)', () => {
    const { container } = render(<BrandLogo />);
    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveClass('rounded-full');
  });

  it('does not apply rounded-full class when rounded=false', () => {
    const { container } = render(<BrandLogo rounded={false} />);
    const wrapper = container.querySelector('span');
    expect(wrapper).not.toHaveClass('rounded-full');
  });

  it('applies custom className to wrapper', () => {
    const { container } = render(<BrandLogo className='my-logo' />);
    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveClass('my-logo');
  });

  it('applies aria-hidden attribute on wrapper', () => {
    const { container } = render(<BrandLogo aria-hidden />);
    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
  });

  it('has fill="currentColor" on svg for CSS color inheritance', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it('renders the canonical brand mark path and viewBox', () => {
    const { container } = render(<BrandLogo />);
    const svg = container.querySelector('svg');
    const path = container.querySelector('path');
    expect(svg?.getAttribute('viewBox')).toBe(
      `0 0 ${JOVIE_VIEWBOX.width} ${JOVIE_VIEWBOX.height}`
    );
    expect(path?.getAttribute('d')).toBe(JOVIE_PATH);
  });

  it('wraps svg in span to isolate from parent [&>svg] selectors', () => {
    const { container } = render(<BrandLogo />);
    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveClass('inline-flex', 'shrink-0');
  });

  it('defaults to the jovie variant with data-brand-variant on wrapper', () => {
    const { container } = render(<BrandLogo />);
    const wrapper = container.querySelector('span');
    expect(wrapper).toHaveAttribute('data-brand-variant', 'jovie');
  });

  it('renders the ov variant with the OV mark path and data attribute', () => {
    const { container } = render(<BrandLogo variant='ov' />);
    const wrapper = container.querySelector('span');
    const path = container.querySelector('path');
    expect(wrapper).toHaveAttribute('data-brand-variant', 'ov');
    expect(path?.getAttribute('d')).toBe(BRAND_PATHS.ov);
  });

  it('defaults aria-label to "OV" for the ov variant', () => {
    render(<BrandLogo variant='ov' />);
    expect(screen.getByLabelText('OV')).toBeInTheDocument();
  });

  it('explicit alt overrides the variant default', () => {
    render(<BrandLogo variant='ov' alt='Custom' />);
    expect(screen.getByLabelText('Custom')).toBeInTheDocument();
  });

  it('passes a11y checks', async () => {
    const { container } = render(<BrandLogo />);
    const result = await expectNoA11yViolations(container);
    expect(result).toBeUndefined();
  });
});
