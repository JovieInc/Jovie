import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_PRODUCT_UI,
} from '@/data/homepageEditorialCopy';
import { PUBLIC_ARTIST_API_VERSIONING_POLICY } from '@/lib/api/v1/contract';
import { HOME_SPEC } from './home-spec';
import { SpecsChapter } from './SpecsChapter';
import { ReleasePage } from './Surfaces';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    void fill;
    void priority;
    return <img alt='' {...rest} />;
  },
}));

describe('homepage v3 specs', () => {
  it('shows the registry counts and one meter segment per recognised service', () => {
    const { container } = render(<SpecsChapter />);
    expect(
      container.querySelector('[data-pen-section="specs"]')
    ).not.toBeNull();
    expect(screen.getByText(String(HOME_SPEC.listen))).toBeInTheDocument();
    expect(screen.getByText(String(HOME_SPEC.recognised))).toBeInTheDocument();
    const segments = container.querySelectorAll('.hv3-meter i');
    expect(segments).toHaveLength(HOME_SPEC.recognised);
    expect(
      container.querySelectorAll('.hv3-meter i[data-on="true"]')
    ).toHaveLength(HOME_SPEC.listen);
    expect(
      screen.getByText(
        HOMEPAGE_EDITORIAL_COPY.specs.meter(
          HOME_SPEC.listen,
          HOME_SPEC.recognised
        )
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: HOMEPAGE_EDITORIAL_COPY.specs.headline,
      })
    ).toBeInTheDocument();
  });

  it('reads the UPC and the API version from where they live', () => {
    render(<SpecsChapter />);
    const version = PUBLIC_ARTIST_API_VERSIONING_POLICY.activeVersion;
    expect(screen.getByText(version)).toBeInTheDocument();
    expect(
      screen.getByText(`openapi spec at /api/${version}`)
    ).toBeInTheDocument();
    const inspected = HOMEPAGE_PRODUCT_UI.inspector;
    expect(
      screen.getByText(`${inspected.upc} · ${inspected.title}`)
    ).toBeInTheDocument();
  });

  it('counts the release page "+N more" from the registry', () => {
    render(<ReleasePage />);
    expect(
      screen.getByText(
        `+${HOME_SPEC.listen - HOME_SPEC.shownServices} more services`
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('Play')).toHaveLength(HOME_SPEC.shownServices);
  });
});
