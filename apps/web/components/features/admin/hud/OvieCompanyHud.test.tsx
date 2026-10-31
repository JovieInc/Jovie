import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CompanyTile } from '@/lib/ovie/home/company-hud';
import { OvieCompanyHud } from './OvieCompanyHud';

const tile = (overrides: Partial<CompanyTile>): CompanyTile => ({
  id: 'alive',
  label: 'Default Alive',
  value: 'Dead',
  line: '$22.96 cash · $110.00/mo burn · runway 0.2 months',
  tone: 'bad',
  measured: true,
  href: '/app/ov/costs',
  hrefLabel: 'Capacity',
  details: ['Revenue growth is not yet outpacing burn.'],
  ...overrides,
});

const tiles = [
  tile({}),
  tile({
    id: 'revenue',
    label: 'MRR',
    value: '$0.00',
    line: 'no baseline',
    tone: 'bad',
    href: '/app/ov/ops',
    hrefLabel: 'Ops',
    details: [],
  }),
];

describe('OvieCompanyHud large (Full Screen)', () => {
  it('never truncates: no .truncate element, long lines wrap, values are text-5xl', () => {
    const { container } = render(
      <OvieCompanyHud
        large
        since={null}
        tiles={[
          tile({
            line: '$18,400 cash · $6,100/mo burn · runway 3.0 months and a very long tail',
          }),
        ]}
      />
    );
    expect(container.querySelector('.truncate')).toBeNull();
    expect(screen.getByTestId('ovie-tile-alive')).toHaveTextContent(
      'runway 3.0 months and a very long tail'
    );
    expect(container.querySelector('.text-5xl')).not.toBeNull();
  });
});

describe('OvieCompanyHud', () => {
  it('shows one value and one line per tile and no detail until opened', () => {
    render(<OvieCompanyHud tiles={tiles} since={null} />);
    expect(screen.getByTestId('ovie-tile-alive')).toHaveTextContent('Dead');
    expect(screen.getByTestId('ovie-tile-alive')).toHaveTextContent(
      '$22.96 cash'
    );
    expect(screen.queryByTestId('ovie-tile-details')).toBeNull();
  });

  it('discloses details and the owning page on demand, one tile at a time', () => {
    render(<OvieCompanyHud tiles={tiles} since={null} />);
    const alive = screen.getByTestId('ovie-tile-alive');
    fireEvent.click(alive);
    expect(alive).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('ovie-tile-details')).toHaveTextContent(
      'Revenue growth is not yet outpacing burn.'
    );
    expect(screen.getByRole('link', { name: 'Open Capacity' })).toHaveAttribute(
      'href',
      '/app/ov/costs'
    );
    fireEvent.click(screen.getByTestId('ovie-tile-revenue'));
    expect(alive).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('ovie-tile-details')).toHaveTextContent(
      'No further detail.'
    );
    fireEvent.keyDown(screen.getByTestId('ovie-tile-revenue'), {
      key: 'Escape',
    });
    expect(screen.queryByTestId('ovie-tile-details')).toBeNull();
  });

  it('keeps the grid frame while loading and marks it busy', () => {
    render(<OvieCompanyHud tiles={null} since={null} />);
    expect(screen.getAllByTestId('ovie-tile-loading')).toHaveLength(6);
    expect(screen.getByTestId('ovie-company-hud')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it('names what changed since the last look, or says nothing did', () => {
    const { rerender } = render(
      <OvieCompanyHud
        tiles={tiles}
        since={{
          ageLabel: '3h ago',
          lines: ['MRR $0 to $120', '+2 signups (7d)'],
        }}
      />
    );
    expect(screen.getByTestId('ovie-since-last-looked')).toHaveTextContent(
      'Since you last looked, 3h ago: MRR $0 to $120 · +2 signups (7d)'
    );
    rerender(
      <OvieCompanyHud tiles={tiles} since={{ ageLabel: '3h ago', lines: [] }} />
    );
    expect(screen.getByTestId('ovie-since-last-looked')).toHaveTextContent(
      'Nothing changed since you last looked, 3h ago'
    );
  });

  it('marks unmeasured tiles as such instead of a calm value', () => {
    render(
      <OvieCompanyHud
        tiles={[
          tile({
            value: 'Not measured',
            measured: false,
            tone: 'neutral',
            details: [],
          }),
        ]}
        since={null}
      />
    );
    expect(screen.getByTestId('ovie-tile-alive')).toHaveAttribute(
      'data-measured',
      'false'
    );
  });
});
