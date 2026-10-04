import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  privilegedAccess: vi.fn(),
  data: vi.fn(),
  effect: vi.fn(),
}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.access,
  requireOvieApiAccess: mocks.privilegedAccess,
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.data,
    insert: mocks.data,
    update: mocks.data,
    delete: mocks.data,
    execute: mocks.data,
  },
}));
vi.mock('@/lib/security/development-only', async original => ({
  ...(await original<typeof import('@/lib/security/development-only')>()),
  isExplicitDevelopmentEnvironment: () => true,
}));

import * as Route0 from '@/app/api/admin/acquisition/proof-claim-funnel/route.ts';
import * as Route1 from '@/app/api/admin/agent-os/workflows/dry-run/route.ts';
import * as Route2 from '@/app/api/admin/agent-os/workflows/runs/[runId]/route.ts';
import * as Route3 from '@/app/api/admin/batch-ingest/route.ts';
import * as Route4 from '@/app/api/admin/campaigns/invites/route.ts';
import * as Route5 from '@/app/api/admin/campaigns/settings/route.ts';
import * as Route6 from '@/app/api/admin/campaigns/stats/route.ts';
import * as Route7 from '@/app/api/admin/contacts/route.ts';
import * as Route8 from '@/app/api/admin/creator-avatar/route.ts';
import * as Route9 from '@/app/api/admin/creator-ingest/rerun/route.ts';
import * as Route10 from '@/app/api/admin/creator-ingest/route.ts';
import * as Route11 from '@/app/api/admin/creator-invite/bulk/route.ts';
import * as Route12 from '@/app/api/admin/creator-invite/bulk/stats/route.ts';
import * as Route13 from '@/app/api/admin/creator-invite/route.ts';
import * as Route14 from '@/app/api/admin/creator-social-links/route.ts';
import * as Route15 from '@/app/api/admin/creators/route.ts';
import * as Route16 from '@/app/api/admin/design-lab/proposals/[proposalId]/review/route.ts';
import * as Route17 from '@/app/api/admin/design-lab/proposals/route.ts';
import * as Route18 from '@/app/api/admin/feedback/[id]/dismiss/route.ts';
import * as Route19 from '@/app/api/admin/feedback/route.ts';
import * as Route20 from '@/app/api/admin/fit-scores/route.ts';
import * as Route21 from '@/app/api/admin/hud/founder-funnel/route.ts';
import * as Route22 from '@/app/api/admin/hud/shipping-velocity/route.ts';
import * as Route23 from '@/app/api/admin/hud/tim-actions/route.ts';
import * as Route24 from '@/app/api/admin/hud/visual-qa/[runId]/[surfaceId]/[kind]/route.ts';
import * as Route25 from '@/app/api/admin/hud/visual-qa/[runId]/review/route.ts';
import * as Route26 from '@/app/api/admin/hud/visual-qa/route.ts';
import * as Route27 from '@/app/api/admin/leads/[id]/dm-sent/route.ts';
import * as Route28 from '@/app/api/admin/leads/[id]/route.ts';
import * as Route29 from '@/app/api/admin/leads/[id]/skip/route.ts';
import * as Route30 from '@/app/api/admin/leads/discover/route.ts';
import * as Route31 from '@/app/api/admin/leads/funnel/route.ts';
import * as Route32 from '@/app/api/admin/leads/keywords/route.ts';
import * as Route33 from '@/app/api/admin/leads/qualify/route.ts';
import * as Route34 from '@/app/api/admin/leads/route.ts';
import * as Route35 from '@/app/api/admin/leads/seed/route.ts';
import * as Route36 from '@/app/api/admin/leads/settings/route.ts';
import * as Route37 from '@/app/api/admin/moderation/route.ts';
import * as Route48 from '@/app/api/admin/outbound/readiness/route.ts';
import * as Route47 from '@/app/api/admin/outbound/route.ts';
import * as Route38 from '@/app/api/admin/outreach/debug/route.ts';
import * as Route39 from '@/app/api/admin/outreach/route.ts';
import * as Route40 from '@/app/api/admin/outreach/settings/route.ts';
import * as Route41 from '@/app/api/admin/overview/route.ts';
import * as Route42 from '@/app/api/admin/re-enrich/route.ts';
import * as Route43 from '@/app/api/admin/screenshots/[filename]/route.ts';
import * as Route44 from '@/app/api/admin/test-user/set-plan/route.ts';
import * as Route45 from '@/app/api/admin/users/route.ts';
import * as Route46 from '@/app/api/admin/waitlist/route.ts';

const cases = [
  ['GET', '/api/admin/acquisition/proof-claim-funnel', Route0.GET],
  ['POST', '/api/admin/agent-os/workflows/dry-run', Route1.POST],
  ['GET', '/api/admin/agent-os/workflows/runs/[runId]', Route2.GET],
  ['POST', '/api/admin/batch-ingest', Route3.POST],
  ['GET', '/api/admin/campaigns/invites', Route4.GET],
  ['GET', '/api/admin/campaigns/settings', Route5.GET],
  ['POST', '/api/admin/campaigns/settings', Route5.POST],
  ['GET', '/api/admin/campaigns/stats', Route6.GET],
  ['GET', '/api/admin/contacts', Route7.GET],
  ['POST', '/api/admin/contacts', Route7.POST],
  ['POST', '/api/admin/creator-avatar', Route8.POST],
  ['POST', '/api/admin/creator-ingest/rerun', Route9.POST],
  ['POST', '/api/admin/creator-ingest', Route10.POST],
  ['POST', '/api/admin/creator-invite/bulk', Route11.POST],
  ['GET', '/api/admin/creator-invite/bulk', Route11.GET],
  ['GET', '/api/admin/creator-invite/bulk/stats', Route12.GET],
  ['POST', '/api/admin/creator-invite', Route13.POST],
  ['GET', '/api/admin/creator-social-links', Route14.GET],
  ['PUT', '/api/admin/creator-social-links', Route14.PUT],
  ['GET', '/api/admin/creators', Route15.GET],
  ['POST', '/api/admin/design-lab/proposals/[proposalId]/review', Route16.POST],
  ['GET', '/api/admin/design-lab/proposals', Route17.GET],
  ['POST', '/api/admin/feedback/[id]/dismiss', Route18.POST],
  ['GET', '/api/admin/feedback', Route19.GET],
  ['GET', '/api/admin/fit-scores', Route20.GET],
  ['POST', '/api/admin/fit-scores', Route20.POST],
  ['GET', '/api/admin/hud/founder-funnel', Route21.GET],
  ['GET', '/api/admin/hud/shipping-velocity', Route22.GET],
  ['GET', '/api/admin/hud/tim-actions', Route23.GET],
  ['POST', '/api/admin/hud/tim-actions', Route23.POST],
  ['GET', '/api/admin/hud/visual-qa/[runId]/[surfaceId]/[kind]', Route24.GET],
  ['POST', '/api/admin/hud/visual-qa/[runId]/review', Route25.POST],
  ['GET', '/api/admin/hud/visual-qa', Route26.GET],
  ['PATCH', '/api/admin/leads/[id]/dm-sent', Route27.PATCH],
  ['PATCH', '/api/admin/leads/[id]', Route28.PATCH],
  ['DELETE', '/api/admin/leads/[id]', Route28.DELETE],
  ['PATCH', '/api/admin/leads/[id]/skip', Route29.PATCH],
  ['POST', '/api/admin/leads/discover', Route30.POST],
  ['GET', '/api/admin/leads/funnel', Route31.GET],
  ['GET', '/api/admin/leads/keywords', Route32.GET],
  ['POST', '/api/admin/leads/keywords', Route32.POST],
  ['PATCH', '/api/admin/leads/keywords', Route32.PATCH],
  ['DELETE', '/api/admin/leads/keywords', Route32.DELETE],
  ['POST', '/api/admin/leads/qualify', Route33.POST],
  ['GET', '/api/admin/leads', Route34.GET],
  ['POST', '/api/admin/leads', Route34.POST],
  ['POST', '/api/admin/leads/seed', Route35.POST],
  ['GET', '/api/admin/leads/settings', Route36.GET],
  ['PATCH', '/api/admin/leads/settings', Route36.PATCH],
  ['GET', '/api/admin/moderation', Route37.GET],
  ['POST', '/api/admin/moderation', Route37.POST],
  ['GET', '/api/admin/outreach/debug', Route38.GET],
  ['GET', '/api/admin/outreach', Route39.GET],
  ['POST', '/api/admin/outreach', Route39.POST],
  ['PATCH', '/api/admin/outreach', Route39.PATCH],
  ['GET', '/api/admin/outreach/settings', Route40.GET],
  ['GET', '/api/admin/overview', Route41.GET],
  ['POST', '/api/admin/re-enrich', Route42.POST],
  ['GET', '/api/admin/screenshots/[filename]', Route43.GET],
  ['POST', '/api/admin/test-user/set-plan', Route44.POST],
  ['GET', '/api/admin/users', Route45.GET],
  ['GET', '/api/admin/waitlist', Route46.GET],
  ['GET', '/api/admin/outbound', Route47.GET],
  ['POST', '/api/admin/outbound', Route47.POST],
  ['GET', '/api/admin/outbound/readiness', Route48.GET],
] as const;
// The real handlers must invoke scoped operator access before private data or
// side effects. The access helper's own tests verify locked/role/MFA decisions.
describe('admin privacy boundary enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.effect);
    mocks.effect.mockRejectedValue(
      Error('External action reached before authorization')
    );
    mocks.access.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: false,
      userId: 'operator',
    });
    mocks.privilegedAccess.mockResolvedValue(
      new Response(null, { status: 403 })
    );
    mocks.data.mockImplementation(() => {
      throw Error('Private data reached before authorization');
    });
  });
  it.each(cases)(
    '%s %s denies scoped operator access before data/actions',
    async (method, path, handler) => {
      const request = new NextRequest(`https://jov.ie${path}`, { method });
      const call = handler as unknown as (
        request: NextRequest,
        context: { params: Promise<Record<string, string>> }
      ) => Promise<Response>;
      const response = await call(request, {
        params: Promise.resolve({
          id: 'id',
          proposalId: 'id',
          runId: 'run',
          surfaceId: 'screen',
          kind: 'after',
          filename: 'file.png',
        }),
      });
      expect([401, 403]).toContain(response.status);
      const privileged =
        method === 'POST' &&
        [
          '/api/admin/creator-invite',
          '/api/admin/creator-invite/bulk',
          '/api/admin/creator-ingest/rerun',
          '/api/admin/re-enrich',
        ].includes(path);
      if (privileged)
        expect(mocks.privilegedAccess).toHaveBeenCalledWith({
          privileged: true,
        });
      else expect(mocks.access).toHaveBeenCalled();
      expect(mocks.data).not.toHaveBeenCalled();
      expect(mocks.effect).not.toHaveBeenCalled();
      const scope = mocks.access.mock.calls.at(-1)?.[0];
      if (
        method !== 'GET' ||
        [
          '/api/admin/creators',
          '/api/admin/leads',
          '/api/admin/leads/settings',
          '/api/admin/outreach',
        ].includes(path)
      )
        expect(scope?.purpose).not.toBe('read');
    }
  );
});

// Invoke real mutation handlers with every central-denial contract, before any
// body parsing, database work, or outbound action can occur.
describe.each([
  ['creator invite', Route13.POST],
  ['bulk invites', Route11.POST],
  ['ingestion rerun', Route9.POST],
  ['re-enrichment', Route42.POST],
] as const)('%s privileged denial contract', (_name, handler) => {
  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [403, 'PASSKEY_STEP_UP_REQUIRED'],
    [403, 'PRIVACY_UNLOCK_REQUIRED'],
    [503, 'PRIVACY_UNAVAILABLE'],
  ])('preserves %s %s before effects', async (status, code) => {
    vi.clearAllMocks();
    const denial = new Response(JSON.stringify({ error: code, code }), {
      status: Number(status),
      headers: { 'Cache-Control': 'private, no-store' },
    });
    mocks.privilegedAccess.mockResolvedValue(denial);
    const request = new NextRequest('https://jov.ie/api/admin', {
      method: 'POST',
      body: '{}',
    });
    const response = await handler(request);
    expect(response).toBe(denial);
    expect(await response.json()).toEqual({ error: code, code });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.privilegedAccess).toHaveBeenCalledWith({ privileged: true });
    expect(mocks.data).not.toHaveBeenCalled();
    expect(mocks.effect).not.toHaveBeenCalled();
  });
});
