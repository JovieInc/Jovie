import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MoneyOverviewClient } from '@/app/app/money/MoneyOverviewClient';
import { overview, tx } from '@/tests/fixtures/money-overview';

describe('MoneyOverviewClient', () => {
  it('renders an unchanged income comparison neutrally', () => {
    const o = overview([
      tx({ daysAgo: 40, amount: -3000 }),
      tx({ daysAgo: 10, amount: -3000 }),
    ]);
    const root = document.createElement('div');
    root.innerHTML = renderToStaticMarkup(
      createElement(MoneyOverviewClient, { overview: o })
    );
    const metric = root.querySelector('[data-testid="money-metric-income"]');
    expect(metric?.textContent).toContain('No change:');
    expect(metric?.textContent).not.toMatch(/[▲▼]|Unfavorable/);
    expect(metric?.querySelector('.text-error')).toBeNull();
  });
});
