import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_CATALOG,
  HOMEPAGE_PRODUCT_UI,
} from '@/data/homepageProductUi';
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
  it('lists the featured artist’s catalog with the inspected release selected', () => {
    const { container } = render(<AppWindow />);
    const rows = container.querySelectorAll('.hv3-rrow');
    expect(rows).toHaveLength(HOMEPAGE_CATALOG.length);
    const selected = container.querySelector('.hv3-rrow[data-selected="true"]');
    expect(selected).toHaveTextContent(HOMEPAGE_PRODUCT_UI.inspector.title);
    expect(container).not.toHaveTextContent('Tim White');
    // Three registry glyphs per row, in the registry's brand colours.
    expect(rows[0]?.querySelectorAll('.hv3-dsp svg')).toHaveLength(3);
  });

  it('inspects the release with every field and anchors the UPC callout', () => {
    const { container } = render(<ReleaseInspector anchor='upc' />);
    const fields = HOMEPAGE_PRODUCT_UI.inspector.fields;
    for (const label of Object.values(fields)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(
      screen.getByText(HOMEPAGE_PRODUCT_UI.inspector.upc)
    ).toBeInTheDocument();
    expect(container.querySelector('[data-hv3-anchor="upc"]')).not.toBeNull();
  });

  it('anchors the connector on the selected catalog row only', () => {
    const { container } = render(<CatalogPlate />);
    const anchors = container.querySelectorAll('[data-hv3-anchor]');
    expect(
      [...anchors].map(anchor => anchor.getAttribute('data-hv3-anchor'))
    ).toEqual(['rowR', 'row']);
    expect(anchors[0]?.closest('.hv3-rrow')).toHaveTextContent(
      HOMEPAGE_PRODUCT_UI.inspector.title
    );
  });
});
