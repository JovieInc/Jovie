import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_PRODUCT_UI,
  HOMEPAGE_SPECS_COPY,
} from '@/data/homepageProductUi';
import { PUBLIC_ARTIST_API_VERSIONING_POLICY } from '@/lib/api/v1/contract';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
  it('shows the registry counts and one meter segment per recognised service', async () => {
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
        HOMEPAGE_SPECS_COPY.meter(HOME_SPEC.listen, HOME_SPEC.recognised)
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: HOMEPAGE_SPECS_COPY.headline,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the specs chapter accessible in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <SpecsChapter />
      </div>
    );
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: HOMEPAGE_SPECS_COPY.headline,
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
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
