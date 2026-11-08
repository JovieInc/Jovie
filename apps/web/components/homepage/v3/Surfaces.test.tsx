import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_PRODUCT_UI } from '@/data/homepageProductUi';
import { Callout, CommandPaletteCard } from './Surfaces';

const PALETTE = HOMEPAGE_PRODUCT_UI.palette;

describe('homepage v3 surfaces', () => {
  it('shows the command palette at rest with Profile selected', () => {
    const { container } = render(<CommandPaletteCard />);
    expect(screen.getByText(PALETTE.placeholder)).toBeInTheDocument();
    const rows = container.querySelectorAll('li');
    expect(rows).toHaveLength(PALETTE.goTo.length + PALETTE.skills.length);
    expect(
      container.querySelector('li[data-selected="true"]')
    ).toHaveTextContent('Profile');
    // The typing target exists, so the motion layer can select it.
    expect(
      container.querySelector(`li[data-hv3-row="${PALETTE.queryTarget}"]`)
    ).not.toBeNull();
  });

  it('renders a hidden-until-placed callout bound to its anchor', () => {
    const { container } = render(
      <Callout anchor='upc' side='left' label='per release' />
    );
    const callout = container.querySelector('[data-hv3-callout="upc"]');
    expect(callout).toHaveClass('hv3-callout', 'hv3-callout--l');
    expect(callout).toHaveAttribute('aria-hidden', 'true');
    expect(callout).toHaveTextContent('per release');
    expect(callout).not.toHaveAttribute('data-placed');
  });
});
