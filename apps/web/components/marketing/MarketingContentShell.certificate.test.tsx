import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MarketingContentShell } from './MarketingContentShell';

describe('MarketingContentShell certificate', () => {
  it('wraps the page body in the prose shell axe-clean', async () => {
    const { container } = render(
      <MarketingContentShell className='legal'>
        <h1>Terms</h1>
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
      </MarketingContentShell>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Terms' })
    ).toBeVisible();
    const body = screen.getByText('First paragraph.').parentElement;
    expect(body).toHaveClass('marketing-body', 'legal');
    expect(body?.childElementCount).toBe(3);
    await expectNoA11yViolations(container);
  });

  it('keeps a right-to-left body axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MarketingContentShell>
          <h1>عن جوفي</h1>
          <p>منتج واحد للحضور والعلاقات.</p>
        </MarketingContentShell>
      </div>
    );
    expect(screen.getByRole('heading', { name: 'عن جوفي' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
