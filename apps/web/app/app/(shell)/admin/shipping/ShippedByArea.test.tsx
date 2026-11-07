import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { groupShippedByArea, ShippedByAreaView } from './ShippedByArea';

const pr = (repo: string, number: number, title: string) => ({
  repo,
  number,
  title,
  url: `https://github.com/JovieInc/${repo}/pull/${number}`,
  mergedAt: '2026-10-25T01:00:00Z',
});

describe('ShippedByArea', () => {
  const recent = [
    pr('Jovie', 1, 'fix(billing): retry failed charge'),
    pr('Jovie', 2, 'chore(deps): bump zod'),
    pr('LogYourBody', 2, 'fix(ios): keep sheet open'),
    pr('Jovie', 3, 'feat(lanes): remove caps'),
  ];

  it('groups by area and keeps same-numbered PRs from different repos apart', () => {
    const groups = groupShippedByArea(recent);
    const total = groups.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(4);
    expect(groups.map(g => g.area)).toEqual(
      expect.arrayContaining(['billing', 'dependencies', 'mobile', 'delivery'])
    );
  });

  it('renders PR links with kind and summary, no issue ids', () => {
    render(<ShippedByAreaView recent={recent} />);
    const billing = screen.getByTestId('shipped-area-billing');
    const link = within(billing).getByRole('link');
    expect(link.getAttribute('href')).toBe(
      'https://github.com/JovieInc/Jovie/pull/1'
    );
    expect(link.textContent).toContain('retry failed charge');
  });

  it('says so when nothing merged', () => {
    render(<ShippedByAreaView recent={[]} />);
    expect(screen.getByText(/No merges recorded/)).toBeTruthy();
  });
});
