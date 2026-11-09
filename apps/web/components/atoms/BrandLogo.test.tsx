import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jovieMarkAtSize } from '@/lib/brand/tokens';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('renders the selected brand with its accessible name and size', () => {
    render(
      <BrandLogo variant='ov' size='splash' tone='color' rounded={false} />
    );

    const mark = screen.getByRole('img', { name: 'OV' });
    expect(mark).toHaveAttribute('width', '32');
    expect(mark).toHaveAttribute('height', '32');
    expect(mark.parentElement).toHaveAttribute('data-brand-variant', 'ov');
    expect(mark.parentElement).toHaveClass('text-accent');
    expect(mark.parentElement).not.toHaveClass('rounded-full');
  });

  it('omits decorative marks from the accessible tree', () => {
    const { container } = render(<BrandLogo aria-hidden size={24} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-label');
  });

  it('draws the same pixel-master O for every variant', () => {
    const master = jovieMarkAtSize(16);
    const { container } = render(
      <>
        <BrandLogo variant='jovie' size={16} />
        <BrandLogo variant='ov' size={16} />
      </>
    );

    const marks = container.querySelectorAll('svg');
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark).toHaveAttribute('viewBox', master.viewBox);
      expect(mark.querySelector('path')).toHaveAttribute('d', master.d);
    }
  });

  it('falls back to the default size, tone and wordmark with only defaults', async () => {
    const { container } = render(<BrandLogo />);

    const mark = screen.getByRole('img', { name: 'Jovie' });
    expect(mark.parentElement).toHaveAttribute('data-brand-variant', 'jovie');
    expect(mark.parentElement).toHaveClass('rounded-full');
    await expectNoA11yViolations(container);
  });

  it('keeps a long accessible name without growing the mark', async () => {
    const alt =
      'Jovie, the link-in-bio and fan conversion platform for independent artists, DJs and labels, return to the homepage';
    const { container } = render(<BrandLogo size='splash' alt={alt} />);

    const mark = screen.getByRole('img', { name: alt });
    expect(mark).toHaveAttribute('width', '32');
    expect(mark.parentElement).toHaveClass('shrink-0');
    await expectNoA11yViolations(container);
  });

  it('renders inside a right-to-left row without axe violations', async () => {
    const { container } = render(
      <div dir='rtl'>
        <BrandLogo alt='جوفي' />
        <span>جلسات منتصف الليل</span>
      </div>
    );

    expect(screen.getByRole('img', { name: 'جوفي' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('paints the white tone with the ZiaWI on-media mark, not raw white', () => {
    render(<BrandLogo tone='white' />);
    const wrapper = screen.getByRole('img', { name: 'Jovie' }).parentElement;
    expect(wrapper).toHaveClass('text-on-media');
    expect(wrapper?.className).not.toMatch(/\btext-white\b/);
  });

  it('has no axe violations for coloured and decorative marks', async () => {
    const { container } = render(
      <>
        <BrandLogo variant='ov' tone='color' />
        <BrandLogo tone='muted' aria-hidden />
      </>
    );
    await expectNoA11yViolations(container);
  });
});
