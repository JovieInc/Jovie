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
import models from '../../../../../scripts/backlog-orchestrator/config/model-registry.json';
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
const view = evaluateRegistry(ops, { now: NOW, spend, models });

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

const liveMetrics = {
  metrics: {
    windowDays: 7,
    mergedInWindow: 619,
    readAt: '2026-10-25T01:27:44Z',
    providers: {
      'openai-codex': {
        windowDays: 7,
        runs: 1377,
        prsCreated: 100,
        mergedCreated: 51,
        mergedRepaired: 201,
        costUsd: 137.99,
        costBasis: 'amortized-plan',
        costPerMergedUsd: 2.71,
      },
      hyperagent: {
        windowDays: 7,
        runs: 11,
        prsCreated: 0,
        mergedCreated: 0,
        mergedRepaired: 0,
        costUsd: 333.2,
        costBasis: 'credit-burn-estimate',
        costPerMergedUsd: null,
      },
    },
  },
};

function boardWith(selectedId: string, live: object | null) {
  const v = evaluateRegistry(ops, {
    now: NOW,
    spend,
    models,
    live: live ?? {},
  });
  return render(
    <CapacityBoard
      view={v}
      order={routingOrder(v)}
      selectedId={selectedId}
      basePath='/app/ov/capacity'
      now={NOW}
      registryUpdatedAt={ops.updatedAt}
      liveOverlay={live ? 'applied' : 'none'}
    />
  );
}

describe('value and alerts', () => {
  it('raises the credits alarm while Grok is under pace', () => {
    board('hyperagent');
    const alerts = screen.getByTestId('capacity-alerts');
    expect(within(alerts).getByRole('alert').textContent).toMatch(
      /Hyperagent .* under pace: route work there first/
    );
  });

  it('shows cost per merge with its basis when the overlay carries metrics', () => {
    boardWith('openai-codex', liveMetrics);
    const value = screen.getByTestId('capacity-value');
    expect(value.textContent).toMatch(/\$2\.71/);
    expect(value.textContent).toMatch(/amortized-plan/);
    expect(value.textContent).toMatch(/51 merged PRs created, 201 repaired/);
  });

  it('says plainly when there are no lane-receipted merges instead of showing zero cost per merge', () => {
    boardWith('hyperagent', liveMetrics);
    const value = screen.getByTestId('capacity-value');
    expect(value.textContent).toMatch(/No lane-receipted merges in 7 days/);
    expect(value.textContent).toMatch(/not in lane receipts/);
    expect(value.textContent).not.toMatch(/\$0 /);
  });

  it('is explicit when the value is not measured or the window is incomplete', () => {
    board('openai-codex');
    expect(screen.getByTestId('capacity-value').textContent).toMatch(
      /Not measured here/
    );
    document.body.innerHTML = '';
    boardWith('openai-codex', { metrics: { incomplete: 'max_pages_reached' } });
    expect(screen.getByTestId('capacity-value').textContent).toMatch(
      /Merge window unreadable \(max_pages_reached\)/
    );
  });
});

describe('access paths and roles', () => {
  it('shows the same model as separate rows per access path with list prices', () => {
    board('openai-codex');
    const paths = screen.getByTestId('capacity-paths');
    const rows = within(paths)
      .getAllByRole('listitem')
      .filter(r => r.textContent?.includes('glm-5.3'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(
      /Given credits \(hyperagent\).*0\.3 \/ 1\.2/
    );
    expect(rows[1].textContent).toMatch(
      /API \(vercel-ai-gateway\).*0\.5625 \/ 1\.8326/
    );
    const luna = within(paths)
      .getAllByRole('listitem')
      .filter(r => r.textContent?.includes('gpt-6-luna'));
    const text = luna.map(r => r.textContent).join(' ');
    expect(text).toMatch(/API.*0\.1 \/ 0\.5.*list price, cash/);
    expect(text).toMatch(
      /Subscription seat \(openai-codex\).*lyb-pro: ahead of pace: rising toward API/
    );
  });

  it('states the planner: Kimi K3 now with K3.1 Pro preferred and watched', () => {
    board('openai-codex');
    const roles = screen.getByTestId('capacity-roles');
    expect(roles.textContent).toMatch(/planner: Kimi K3 now/);
    expect(roles.textContent).toMatch(/Kimi K3\.1 Pro watching \(preferred\)/);
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
