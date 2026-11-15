import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LegalHero } from './LegalHero';

describe('LegalHero certificate', () => {
  it('renders the header with its date line, axe-clean', async () => {
    const { container } = render(
      <LegalHero
        title='Terms of Service'
        lastUpdated='September 1, 2026'
        practicalSummary='Use Jovie in good faith.'
      />
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms of Service' })
    ).toBeVisible();
    expect(
      screen.getByText('Last updated: September 1, 2026')
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toContainElement(
      screen.getByText('Use Jovie in good faith.')
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean without a date and with a long title', async () => {
    const title =
      'Data Processing Addendum, Sub-processor List and Standard Contractual Clauses';
    const { container } = render(
      <LegalHero title={title} lastUpdated='' practicalSummary='Notice.' />
    );

    expect(screen.getByRole('heading', { name: title })).toBeVisible();
    expect(screen.queryByText(/Last updated/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders Arabic copy inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <LegalHero
          title='شروط الخدمة'
          lastUpdated='١ سبتمبر ٢٠٢٦'
          practicalSummary='استخدم جوفي بحسن نية.'
        />
      </div>
    );

    expect(screen.getByRole('heading', { name: 'شروط الخدمة' })).toBeVisible();
    expect(screen.getByText('Last updated: ١ سبتمبر ٢٠٢٦')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
