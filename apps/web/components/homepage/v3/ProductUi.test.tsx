import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_CATALOG,
  HOMEPAGE_PRODUCT_UI,
} from '@/data/homepageProductUi';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AppWindow, CatalogPlate, ReleaseInspector } from './ProductUi';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    void fill;
    void priority;
    return <img alt='' {...rest} />;
  },
}));

describe('homepage v3 product UI', () => {
  it('lists the featured artist’s catalog with the inspected release selected', async () => {
    const { container } = render(<AppWindow />);
    const rows = container.querySelectorAll('.hv3-rrow');
    expect(rows).toHaveLength(HOMEPAGE_CATALOG.length);
    const selected = container.querySelector('.hv3-rrow[data-selected="true"]');
    expect(selected).toHaveTextContent(HOMEPAGE_PRODUCT_UI.inspector.title);
    expect(rows[0]).toHaveTextContent(HOMEPAGE_CATALOG[0]?.title ?? '');
    // Three registry glyphs per row, all in the surrounding ink: the
    // homepage never sets a service in its brand colour.
    const paths = rows[0]?.querySelectorAll('.hv3-dsp svg path') ?? [];
    expect(paths).toHaveLength(3);
    for (const path of paths) {
      expect(path.getAttribute('fill')).toBe('currentColor');
    }
    await expectNoA11yViolations(container);
  });

  it('inspects the release with every field and anchors the UPC callout', async () => {
    const { container } = render(<ReleaseInspector anchor='upc' />);
    const fields = HOMEPAGE_PRODUCT_UI.inspector.fields;
    for (const label of Object.values(fields)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByText(HOMEPAGE_PRODUCT_UI.inspector.upc)
    ).toBeInTheDocument();
    expect(container.querySelector('[data-hv3-anchor="upc"]')).not.toBeNull();
    expect(
      screen.getByText(HOMEPAGE_PRODUCT_UI.inspector.artist)
    ).toBeInTheDocument();
    expect(container.querySelector('.hv3-insp__ok')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('anchors the connector on the selected catalog row only', async () => {
    const { container } = render(<CatalogPlate />);
    const anchors = container.querySelectorAll('[data-hv3-anchor]');
    expect(
      [...anchors].map(anchor => anchor.getAttribute('data-hv3-anchor'))
    ).toEqual(['rowR']);
    expect(anchors[0]?.closest('.hv3-rrow')).toHaveTextContent(
      HOMEPAGE_PRODUCT_UI.inspector.title
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the Releases window accessible in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AppWindow />
      </div>
    );
    expect(container.querySelectorAll('.hv3-rrow')).toHaveLength(
      HOMEPAGE_CATALOG.length
    );
    await expectNoA11yViolations(container);
  });
});
