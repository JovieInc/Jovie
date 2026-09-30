vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: vi.fn(async () => null),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCertificationDecisionDigest } from '@/lib/agent-os/certification';
import {
  fixturePacket,
  memoryCertificationBackend,
} from '@/lib/ovie/certifications/fixtures';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  entitlements: vi.fn(),
  isAdmin: vi.fn(),
  backend: vi.fn(),
  packetFiles: vi.fn(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/admin/roles', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  getMarketingCertificationStore: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: mocks.backend,
}));
vi.mock(
  '@/lib/ovie/certifications/packet-files.server',
  async importActual => ({
    ...(await importActual<
      typeof import('@/lib/ovie/certifications/packet-files.server')
    >()),
    readCertificationPacketFiles: mocks.packetFiles,
  })
);

const packet = fixturePacket('signup');
const digest = buildCertificationDecisionDigest(packet);

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('https://jov.ie/api/ovie/certifications/decisions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

const validBody = {
  rowId: 'flows:signup',
  evidenceDigest: digest,
  decision: 'approved',
  actionId: 'action-0001',
  notes: null,
};

const founder = {
  isAuthenticated: true,
  userId: 'user_founder',
  email: 'founder@example.test',
  isAdmin: true,
};

describe('POST /api/ovie/certifications/decisions', () => {
  let backend: ReturnType<typeof memoryCertificationBackend>;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = memoryCertificationBackend();
    mocks.backend.mockReturnValue(backend);
    mocks.entitlements.mockResolvedValue(founder);
    mocks.isAdmin.mockResolvedValue(true);
    mocks.packetFiles.mockResolvedValue({
      root: '/repo/docs/certification',
      files: [
        {
          domain: 'flows',
          surface: 'Golden Path',
          packetUpdatedAt: '2020-01-01T00:00:00.000Z',
          links: [],
          packet,
          file: 'docs/certification/signup.packet.json',
        },
      ],
      issues: [],
    });
  });

  it('refuses bearer tokens: a founder decision needs a browser session', async () => {
    const response = await post(validBody, { authorization: 'Bearer abc' });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'session_required' });
    expect(mocks.entitlements).not.toHaveBeenCalled();
  });

  it('returns 401 when signed out and 403 for non-admins', async () => {
    mocks.entitlements.mockResolvedValueOnce({
      isAuthenticated: false,
      userId: null,
      isAdmin: false,
    });
    expect((await post(validBody)).status).toBe(401);

    mocks.entitlements.mockResolvedValueOnce({ ...founder, isAdmin: false });
    mocks.isAdmin.mockResolvedValueOnce(false);
    const forbidden = await post(validBody);
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: 'forbidden' });
    expect(backend.records.size).toBe(0);
  });

  it('asks an admin without a live passkey step-up to unlock first', async () => {
    mocks.entitlements.mockResolvedValueOnce({ ...founder, isAdmin: false });
    const response = await post(validBody);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: 'step_up_required',
    });
    expect(backend.records.size).toBe(0);
  });

  it('rejects malformed bodies', async () => {
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ ...validBody, decision: 'maybe' })).status).toBe(400);
    expect(
      (await post({ ...validBody, decision: 'changes_requested' })).status
    ).toBe(400);
  });

  it('records the decision with the session reviewer, never a body-supplied one', async () => {
    const response = await post({ ...validBody, reviewer: 'attacker' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.row).toMatchObject({
      id: 'flows:signup',
      state: 'founder_locked',
    });
    expect(body.row.history[0]).toMatchObject({
      kind: 'decision',
      actor: 'founder@example.test',
    });
  });

  it('records a change request with its note', async () => {
    const response = await post({
      ...validBody,
      decision: 'changes_requested',
      notes: 'Tighten the empty state copy.',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.row.state).toBe('working');
    expect(body.row.history[0]).toMatchObject({
      type: 'changes_requested',
      summary: 'Tighten the empty state copy.',
    });
  });

  it('returns 409 for replays and stale evidence, 404 for unknown rows', async () => {
    expect((await post(validBody)).status).toBe(200);
    const replay = await post(validBody);
    expect(replay.status).toBe(409);
    expect(await replay.json()).toMatchObject({
      error: 'duplicate_founder_decision',
    });

    const stale = await post({
      ...validBody,
      actionId: 'action-0002',
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
    });
    expect(stale.status).toBe(409);

    expect(
      (await post({ ...validBody, rowId: 'flows:nope', actionId: 'action-3' }))
        .status
    ).toBe(404);
  });

  it('fails closed with 503 when persistence throws', async () => {
    mocks.backend.mockReturnValue({
      ...backend,
      get: vi.fn().mockRejectedValue(new Error('db down')),
    });
    expect((await post(validBody)).status).toBe(503);
  });
});
