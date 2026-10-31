import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FleetAuditPanel } from './FleetAuditPanel';

const event = {
  id: 'e1',
  ts: '2026-10-29T10:00:00.000Z',
  actor_agent: 'claude-lane-3',
  session_id: null,
  host: 'gem',
  repo: 'JovieInc/Jovie',
  target: 'JovieInc/Jovie#123',
  action: 'pr.merge',
  danger: 1 as const,
  reason: 'queue drained',
  issue: null,
  outcome: 'ok',
  before: null,
  after: null,
  source: 'gh-shim' as const,
};
const unattributed = {
  id: 'c1',
  observed_at: '2026-10-29T11:00:00.000Z',
  repo: 'JovieInc/Jovie',
  target: 'JovieInc/Jovie#124',
  change: 'label.add',
  github_actor: 'itstimwhite',
  matched_event_id: null,
  status: 'unattributed' as const,
};

afterEach(() => vi.unstubAllGlobals());

describe('FleetAuditPanel', () => {
  it('renders a not-configured state instead of an error', () => {
    render(<FleetAuditPanel initial={{ state: 'not_configured' }} />);
    expect(
      screen.getByTestId('fleet-audit-not-configured').textContent
    ).toContain('FLEET_AUDIT_READ_TOKEN');
  });

  it('renders budget, dangerous actions and unattributed changes', () => {
    render(
      <FleetAuditPanel
        initial={{
          state: 'ok',
          data: {
            budget: { bytes_month: 25, limit_bytes: 100, pct: 25 },
            dangerous: [event],
            unattributed: [unattributed],
            counts: { events_24h: 4, events_7d: 30 },
          },
        }}
      />
    );
    expect(screen.getByRole('img', { name: /25\.0 percent/ })).toBeTruthy();
    expect(screen.getByText(/Dangerous: pr\.merge/)).toBeTruthy();
    expect(screen.getByText(/no agent record/)).toBeTruthy();
  });

  it('searches through the server route', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ state: 'ok', events: [event], correlations: [] })
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <FleetAuditPanel
        initial={{
          state: 'ok',
          data: {
            budget: { bytes_month: 0, limit_bytes: 100, pct: 0 },
            dangerous: [],
            unattributed: [],
            counts: { events_24h: 0, events_7d: 0 },
          },
        }}
      />
    );
    await userEvent.type(
      screen.getByLabelText(/Search Fleet Audit/),
      'Jovie#123'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() =>
      expect(screen.getByTestId('fleet-audit-results').textContent).toContain(
        'claude-lane-3'
      )
    );
    const called = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(called.startsWith('/api/ovie/fleet-audit?')).toBe(true);
    expect(called).toContain('target=Jovie%23123');
  });
});
