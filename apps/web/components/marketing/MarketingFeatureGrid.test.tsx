import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingFeatureGrid } from './MarketingFeatureGrid';

const items = [
  { title: 'Drafts first', description: 'Nothing ships without you.' },
  { title: 'Your artwork', description: 'Stays yours.' },
];

describe('MarketingFeatureGrid certificate', () => {
  it('renders one heading and body per item in the default grid', async () => {
    const { container } = render(<MarketingFeatureGrid items={items} />);

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map(h => h.textContent)).toEqual([
      'Drafts first',
      'Your artwork',
    ]);
    expect(screen.getByText('Stays yours.')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('grid', 'sm:grid-cols-2');
    await expectNoA11yViolations(container);
  });

  it('uses the caller class instead of the default grid', () => {
    const { container } = render(
      <MarketingFeatureGrid items={items} className='custom-grid' />
    );
    expect(container.firstElementChild).toHaveClass('custom-grid');
    expect(container.firstElementChild).not.toHaveClass('grid');
  });

  it('renders an empty container for no items and RTL copy axe-clean', async () => {
    const empty = render(<MarketingFeatureGrid items={[]} />);
    expect(empty.container.firstElementChild?.childElementCount).toBe(0);
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const rtl = render(
      <div dir='rtl' lang='ar'>
        <MarketingFeatureGrid
          items={[{ title: 'أعمالك ملكك', description: 'لا تُشارك.' }]}
        />
      </div>
    );
    expect(
      screen.getByRole('heading', { name: 'أعمالك ملكك' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(rtl.container);
  });
});
