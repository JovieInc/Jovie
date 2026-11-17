import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getMarketingEditorialBackground } from '@/data/marketing';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingEditorialBackground } from './MarketingEditorialBackground';

describe('MarketingEditorialBackground certificate', () => {
  it('paints the soft master as washes only, out of the accessibility tree', async () => {
    const { container } = render(
      <section aria-label='Hero'>
        <MarketingEditorialBackground variant='soft' testId='bg' />
      </section>
    );

    const bg = screen.getByTestId('bg');
    expect(bg).toHaveAttribute('aria-hidden', 'true');
    expect(bg).toHaveAttribute('data-variant', 'soft');
    expect(bg.querySelector('svg')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('draws one path per registered curve for the flow master', async () => {
    const curves = getMarketingEditorialBackground('flow').curves.list;
    const { container } = render(
      <MarketingEditorialBackground
        variant='flow'
        testId='bg'
        className='extra'
      />
    );

    const bg = screen.getByTestId('bg');
    expect(bg).toHaveClass('marketing-editorial-background', 'extra');
    expect(curves.length).toBeGreaterThan(0);
    expect(bg.querySelectorAll('path')).toHaveLength(curves.length);
    expect(
      bg.querySelector('#marketing-editorial-background-sweep-flow')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
