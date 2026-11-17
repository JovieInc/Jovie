import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

describe('ArtistProfileSectionShell', () => {
  it('renders a plain section with the page-aligned container', async () => {
    const { container } = render(
      <ArtistProfileSectionShell>
        <h2>Chapter</h2>
      </ArtistProfileSectionShell>
    );

    const section = container.querySelector('section');
    expect(section).toHaveClass('ap-section-shell');
    expect(section).not.toHaveAttribute('data-testid');
    expect(container.querySelector('.ap-section-container')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Chapter' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stamps section metadata and forwards the section ref', async () => {
    const ref = createRef<HTMLElement>();
    const { container } = render(
      <ArtistProfileSectionShell
        id='outcomes'
        sectionId='feature-grid'
        sectionVariant='4-ledger'
        sectionOwner='owner.tsx'
        sectionOccurrence='second'
        penContractId={MARKETING_PEN_CONTRACT_IDS.section.featureGrid}
        sectionRef={ref}
        className='extra-shell'
        containerClassName='extra-container'
      >
        <h2>Chapter</h2>
      </ArtistProfileSectionShell>
    );

    const section = screen.getByTestId('marketing-section-feature-grid');
    expect(section).toHaveAttribute('id', 'outcomes');
    expect(section).toHaveAttribute('data-marketing-variant', '4-ledger');
    expect(section).toHaveAttribute('data-marketing-owner', 'owner.tsx');
    expect(section).toHaveAttribute('data-marketing-occurrence', 'second');
    expect(section).toHaveClass('extra-shell');
    expect(ref.current).toBe(section);
    expect(container.querySelector('.extra-container')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('drops the page-aligned class for landing and prose widths', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfileSectionShell width='prose'>
          <h2>مبني حول نتائج الجمهور.</h2>
        </ArtistProfileSectionShell>
      </div>
    );

    expect(container.querySelector('.ap-section-container')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
