import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOMEPAGE_PRODUCT_UI } from '@/data/homepageProductUi';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { Callout, CommandPaletteCard, ReleasePage } from './Surfaces';

const PALETTE = HOMEPAGE_PRODUCT_UI.palette;

describe('homepage v3 surfaces', () => {
  it('shows the command palette at rest with Profile selected', async () => {
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
    await expectNoA11yViolations(container);
  });

  it('shows the featured artist’s inspected release', async () => {
    const { container } = render(<ReleasePage />);
    const page = HOMEPAGE_PRODUCT_UI.releasePage;
    expect(container).toHaveTextContent(page.title);
    expect(container).toHaveTextContent(page.artist);
    await expectNoA11yViolations(container);
  });

  it('lets a second release page take its own title anchor', () => {
    const { container } = render(
      <>
        <ReleasePage titleAnchor='htitle' />
        <ReleasePage />
      </>
    );
    const anchors = [...container.querySelectorAll('[data-hv3-anchor]')].map(
      node => node.getAttribute('data-hv3-anchor')
    );
    expect(anchors).toEqual(['htitle', 'title']);
  });

  it('keeps the release page accessible in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ReleasePage />
      </div>
    );
    expect(container).toHaveTextContent(HOMEPAGE_PRODUCT_UI.releasePage.title);
    await expectNoA11yViolations(container);
  });

  it('renders a hidden-until-placed callout bound to its anchor', async () => {
    const { container } = render(
      <Callout anchor='upc' side='left' label='per release' />
    );
    const callout = container.querySelector('[data-hv3-callout="upc"]');
    expect(callout).toHaveClass('hv3-callout', 'hv3-callout--l');
    expect(callout).toHaveAttribute('aria-hidden', 'true');
    expect(callout).toHaveTextContent('per release');
    expect(callout).not.toHaveAttribute('data-placed');
    await expectNoA11yViolations(container);
  });

  it('keeps a long callout label whole and hidden from assistive tech', async () => {
    const label = 'per release, per territory, per service, refreshed nightly';
    const { container } = render(<Callout anchor='long' label={label} />);
    const callout = container.querySelector('[data-hv3-callout="long"]');
    expect(callout).toHaveTextContent(label);
    expect(callout).toHaveAttribute('aria-hidden', 'true');
    await expectNoA11yViolations(container);
  });
});
