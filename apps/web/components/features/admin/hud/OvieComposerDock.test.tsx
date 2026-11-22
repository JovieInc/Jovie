import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OvieInboxCase } from '@/lib/ovie/inbox';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OvieComposerDock } from './OvieComposerDock';

function makeCase(id: string, evidence: string[] = []): OvieInboxCase {
  return {
    contract: 'jovie.interaction-case/v1',
    id: `summer:${id}`,
    kind: 'spend',
    source: { system: 'summer', id, revision: null },
    title: `Decision ${id}`,
    body: 'Exact proposal',
    recommendation: 'Use owned capacity',
    owner: 'founder',
    state: 'needs_you',
    priority: 1,
    createdAt: '2026-10-02T00:00:00Z',
    nextAction: 'Review',
    waitingUntil: null,
    decisionDefault: null,
    confidence: null,
    evidence,
    decisionTarget: { kind: 'summer', id },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function mount(cases: OvieInboxCase[], decision: () => Response) {
  let pending = [...cases];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const response = decision();
      if (response.ok) pending = pending.slice(1);
      return response;
    }
    return json({ cases: pending, issues: [] });
  });
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <OvieComposerDock />
    </QueryClientProvider>
  );
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe('OvieComposerDock', () => {
  it('shows the top ask with Approve and Reject and a count', async () => {
    mount([makeCase('one'), makeCase('two')], () => json({ ok: true }));
    expect(await screen.findByText('Decision one')).toBeInTheDocument();
    expect(screen.getByTestId('ovie-composer-dock-count')).toHaveTextContent(
      '1 of 2'
    );
    expect(screen.getByTestId('ovie-composer-dock-approve')).toBeEnabled();
    expect(screen.getByTestId('ovie-composer-dock-reject')).toBeEnabled();
  });

  it('has no accessibility violations', async () => {
    mount([makeCase('one')], () => json({ ok: true }));
    await screen.findByText('Decision one');
    await expectNoA11yViolations(screen.getByTestId('ovie-composer-dock'));
  });

  it('collapses to one line and expands again', async () => {
    mount([makeCase('one')], () => json({ ok: true }));
    await userEvent.click(await screen.findByLabelText('Collapse Ask'));
    expect(screen.queryByTestId('ovie-composer-dock-approve')).toBeNull();
    expect(screen.getByText('Decision one')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Expand Ask'));
    expect(screen.getByTestId('ovie-composer-dock-approve')).toBeEnabled();
  });

  it('shows the screenshot thumbnail when the case has Visual QA evidence', async () => {
    mount(
      [makeCase('one', ['/api/admin/hud/visual-qa/run-1/home/after'])],
      () => json({ ok: true })
    );
    const img = await screen.findByTestId('ovie-composer-dock-thumbnail');
    expect(img.getAttribute('src')).toContain(
      '/api/admin/hud/visual-qa/run-1/home/after'
    );
  });

  it('renders nothing when no ask is pending', async () => {
    const fetcher = mount([], () => json({ ok: true }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId('ovie-composer-dock')).toBeNull()
    );
  });

  it('advances to the next ask immediately after a decision', async () => {
    mount([makeCase('one'), makeCase('two')], () => json({ ok: true }));
    await userEvent.click(
      await screen.findByTestId('ovie-composer-dock-approve')
    );
    expect(await screen.findByText('Decision two')).toBeInTheDocument();
    expect(screen.queryByText('Decision one')).toBeNull();
    expect(screen.getByTestId('ovie-composer-dock-count')).toHaveTextContent(
      '1 of 1'
    );
  });

  it('restores the ask with Retry when the decision fails', async () => {
    mount([makeCase('one'), makeCase('two')], () => json({}, 500));
    await userEvent.click(
      await screen.findByTestId('ovie-composer-dock-reject')
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Not recorded. Retry.'
    );
    expect(screen.getByText('Decision one')).toBeInTheDocument();
    expect(screen.getByTestId('ovie-composer-dock-approve')).toHaveTextContent(
      'Retry'
    );
  });
});
