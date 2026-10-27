import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceConflict } from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  scope,
  session,
} from '@/lib/agent-os/design-reference-corpus/adaptive/fixtures.test-utils';

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  auth: vi.fn(),
  read: vi.fn(),
  commit: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.gate,
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mocks.auth }));
vi.mock('@/lib/ovie/reference-review/store.server', () => ({
  referenceRepository: {},
}));
vi.mock('@/lib/agent-os/design-reference-corpus/adaptive/repository', () => ({
  readReferenceSession: mocks.read,
  commitReferenceCommand: mocks.commit,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));

import { GET, POST } from './route';

const url = 'https://example.test/api/admin/reference-review';
const body = {
  contextId: scope.contextId,
  branchId: scope.branchId,
  command: {
    commandId: 'test',
    revision: 1,
    action: { type: 'rate', referenceId: 'ref-001', rating: 5 },
  },
};
function post(data: unknown = body, origin = 'https://example.test') {
  return new Request(url, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({
    userId: 'test-actor',
    actorUserId: null,
    sessionId: 'session',
  });
  mocks.read.mockResolvedValue(session(1));
  mocks.commit.mockResolvedValue(session(1));
  mocks.capture.mockResolvedValue(undefined);
});
describe('private reference API boundary', () => {
  it('exposes canonical design context through the same actor-owned private read', async () => {
    const owned = {
      ...session(3),
      scope: { ...scope, tenantId: 'test-actor' },
    };
    mocks.read.mockResolvedValue(owned);
    const response = await GET(
      new Request(
        `${url}?contextId=editorial&branchId=main&format=design-context&surface=editorial&limit=2&tenantId=other`
      )
    );
    expect(response.status).toBe(200);
    const context = await response.json();
    expect(context.schema).toBe('jovie.design-agent-reference-context/v1');
    expect(context.references).toHaveLength(2);
    expect(
      context.references.every(
        (reference: { rating: number | null }) => reference.rating === null
      )
    ).toBe(true);
    expect(mocks.read).toHaveBeenCalledWith({}, owned.scope);
    expect(context).not.toHaveProperty('scope');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('rejects invalid agent retrieval before reading private data', async () => {
    for (const query of ['surface=editorial&limit=6', 'surface=&limit=1'])
      expect(
        (
          await GET(
            new Request(
              `${url}?contextId=editorial&branchId=main&format=design-context&${query}`
            )
          )
        ).status
      ).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('denies signed-out/privacy-locked access before reading or writing', async () => {
    mocks.gate.mockResolvedValue(
      NextResponse.json({ error: 'denied' }, { status: 403 })
    );
    expect(
      (await GET(new Request(`${url}?contextId=editorial&branchId=main`)))
        .status
    ).toBe(403);
    expect((await POST(post())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('derives actor ownership and does not accept caller tenant IDs', async () => {
    // Use a state with the server-derived ownership, never the caller's tenant.
    const owned = {
      ...session(1),
      scope: { ...scope, tenantId: 'test-actor' },
    };
    mocks.read.mockResolvedValue(owned);
    const response = await GET(
      new Request(`${url}?contextId=editorial&branchId=main&tenantId=other`)
    );
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({}, owned.scope);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await POST(post({ ...body, tenantId: 'other' }))).status).toBe(400);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('refuses cross-origin writes and reports conflicts without claiming a save', async () => {
    expect((await POST(post(body, 'https://other.test'))).status).toBe(403);
    expect(mocks.commit).not.toHaveBeenCalled();
    mocks.commit.mockRejectedValue(
      new ReferenceConflict('References changed. Reload to continue.')
    );
    expect((await POST(post())).status).toBe(409);
  });
});
