import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CapacityBoard } from '@/components/features/admin/capacity/CapacityBoard';
import {
  formatAge,
  formatPercent,
  formatUntil,
  formatUsd,
} from '@/components/features/admin/capacity/capacity-format';
import ops from '../../../../../ops/registry/capacity.json';
import spend from '../../../../../ops/registry/spend.json';
import {
  evaluateRegistry,
  routingOrder,
} from '../../../../../scripts/lib/capacity-registry.mjs';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const NOW = Date.parse('2026-10-25T02:00:00Z');
const view = evaluateRegistry(ops, { now: NOW, spend });

function board(selectedId: string | null) {
  return render(
    <CapacityBoard
      view={view}
      order={routingOrder(view)}
      selectedId={selectedId}
      basePath='/app/ov/capacity'
      now={NOW}
      registryUpdatedAt={ops.updatedAt}
      liveOverlay='none'
    />
  );
}

describe('formatters', () => {
  it('never turns unknown into zero', () => {
    expect(formatUsd(null)).toBe('Unknown');
    expect(formatPercent(undefined)).toBe('Unknown');
    expect(formatUntil(null, NOW)).toBe('Unknown');
    expect(formatAge(null)).toBe('never read');
    expect(formatUsd(4674.34)).toBe('$4,674');
    expect(formatUsd(99)).toBe('$99');
    expect(formatUntil('2026-10-30T17:41:29Z', NOW)).toBe('in 5d 15h');
    expect(formatUntil('2026-10-24T00:00:00Z', NOW)).toBe('passed');
  });
});

describe('CapacityBoard', () => {
  it('shows one screen per provider with a link for each', () => {
    board('openai-codex');
    const nav = screen.getByRole('navigation', { name: 'Providers' });
    expect(within(nav).getAllByRole('link')).toHaveLength(
      view.providers.length
    );
    expect(
      within(nav)
        .getByRole('link', { name: /xAI Grok/ })
        .getAttribute('href')
    ).toBe('/app/ov/capacity?provider=xai-grok');
    expect(screen.getByTestId('capacity-provider-openai-codex')).toBeTruthy();
    expect(screen.queryByTestId('capacity-provider-xai-grok')).toBeNull();
  });

  it('Codex: three live accounts with remaining, reset and pace, plus the lapsed one and the pending decision', () => {
    board('openai-codex');
    const lyb = screen.getByTestId('capacity-account-lyb-pro');
    expect(within(lyb).getByText('43%')).toBeTruthy();
    expect(within(lyb).getByTestId('capacity-quota').textContent).toMatch(
      /Used 57%/
    );
    expect(within(lyb).getByRole('img').getAttribute('aria-label')).toMatch(
      /57% used/
    );
    const lapsed = screen.getByTestId('capacity-account-tim-jov-ie');
    expect(within(lapsed).getByText('lapsed')).toBeTruthy();
    expect(lapsed.textContent).toMatch(/lapsed: not routable/);
    expect(lapsed.textContent).not.toMatch(/Ahead of pace/);
    expect(screen.getByText(/Decision pending \(2026-10-29\)/)).toBeTruthy();
  });

  it('Grok: promo price, list price, end date and under-pace guidance', () => {
    board('xai-grok');
    const account = screen.getByTestId('capacity-account-supergrok-heavy');
    expect(within(account).getByText('$99')).toBeTruthy();
    expect(account.textContent).toMatch(/list \$300, promo ends 2026-12-01/);
    expect(account.textContent).toMatch(/Under pace by \d+ pts/);
  });

  it('Hyperagent: credits, expiry, burn versus needed pace, and the dated caps', () => {
    board('hyperagent');
    const credits = screen.getByTestId('capacity-credits');
    expect(credits.textContent).toMatch(/Burn Per Day/);
    expect(
      screen.getByTestId('capacity-account-founding-500').textContent
    ).toMatch(/\$200 billed yearly/);
    expect(credits.textContent).toMatch(
      /Burn exceeds the pace that lasts to expiry/
    );
    const section = screen.getByTestId('capacity-provider-hyperagent');
    expect(section.textContent).toMatch(/perRunCapUsd/);
    expect(section.textContent).toMatch(/2027-06-01/);
  });

  it('flags stale reads instead of presenting them as current', () => {
    const later = evaluateRegistry(ops, { now: NOW + 10 * 86_400_000, spend });
    render(
      <CapacityBoard
        view={later}
        order={routingOrder(later)}
        selectedId='vercel-ai-gateway'
        basePath='/app/ov/capacity'
        now={NOW + 10 * 86_400_000}
        registryUpdatedAt={ops.updatedAt}
        liveOverlay='none'
      />
    );
    expect(screen.getByTestId('capacity-credits').textContent).toMatch(/Stale/);
    expect(
      screen.getByText('Needs A Fresh Read').nextSibling?.textContent
    ).not.toBe('0');
  });

  it('falls back to the first provider for an unknown selection and lists the delegation order', () => {
    board('nope');
    expect(
      screen.getByTestId(`capacity-provider-${view.providers[0]?.id}`)
    ).toBeTruthy();
    expect(screen.getByText(/Delegation order for agents/)).toBeTruthy();
  });
});
