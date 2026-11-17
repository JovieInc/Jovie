import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MARKETING_PEN_CONTRACT_IDS } from '@/data/marketing/penContracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { HomeStatQuoteSection } from './HomeStatQuoteSection';

describe('HomeStatQuoteSection', () => {
  it('renders the stat, supporting copy and source as one heading', async () => {
    const { container } = render(<HomeStatQuoteSection />);
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('Jovie delivers 2.9x');
    expect(heading).toHaveTextContent(
      'faster releases that compound into more fans.'
    );
    expect(
      screen.getByText('Indie release benchmark, 2026')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('paints the fixed-dark band with the ink-on-media token', () => {
    const { container } = render(<HomeStatQuoteSection />);
    const section = container.querySelector('section');
    expect(section).toHaveClass('bg-ink-on-media');
    expect(section?.className).not.toMatch(/\bbg-black\b/);
  });

  it('renders a stat with no supporting line axe-clean', async () => {
    const { container } = render(
      <HomeStatQuoteSection stat='3x' body='' source='Pilot cohort' />
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Jovie delivers 3x'
    );
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy in a right-to-left document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <HomeStatQuoteSection body='إصدارات أسرع.' source='معيار 2026' />
      </div>
    );
    expect(screen.getByText('معيار 2026')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders caller-provided stat, body and source', () => {
    render(
      <HomeStatQuoteSection
        stat='3x'
        body='more saves.'
        source='Pilot cohort'
      />
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Jovie delivers 3x more saves.'
    );
    expect(screen.getByText('Pilot cohort')).toBeInTheDocument();
  });

  it('binds the Pen stats contract and hides the decorative arcs', () => {
    const { container } = render(<HomeStatQuoteSection />);
    const section = container.querySelector('section');
    expect(section).toHaveAttribute(
      'data-pen-contract',
      MARKETING_PEN_CONTRACT_IDS.section.stats
    );
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});

const OWN_WIDTH_CAP =
  /max-w-(?:300|315|280|4xl|6xl|linear-content)|--homepage-section-max/;

describe('single container width', () => {
  it.each(['components/features/home/HomeStatQuoteSection.tsx'])(
    '%s takes its width from the shared container, not its own cap',
    file => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(OWN_WIDTH_CAP);
    }
  );
});
