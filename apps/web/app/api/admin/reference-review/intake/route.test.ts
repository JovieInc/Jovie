import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceConflict } from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  candidate,
  scope,
  session,
} from '@/lib/agent-os/design-reference-corpus/adaptive/fixtures.test-utils';

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  auth: vi.fn(),
  ingest: vi.fn(),
}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.gate,
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mocks.auth }));
vi.mock('@/lib/ovie/reference-review/store.server', () => ({
  referenceRepository: {},
}));
vi.mock('@/lib/ovie/reference-review/intake', () => ({
  ingestReferenceCapture: mocks.ingest,
}));

import { POST } from './route';

const url = 'https://example.test/api/admin/reference-review/intake';
const selection = { contextId: scope.contextId, branchId: scope.branchId };
const body = {
  ...selection,
  revision: 0,
  candidate: candidate(1),
  base64: 'AQID',
};
function request(value: unknown = body, origin = 'https://example.test') {
  return new Request(url, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ userId: 'test-actor', sessionId: 'session' });
  mocks.ingest.mockResolvedValue({
    ...session(1),
    scope: { ...scope, tenantId: 'test-actor' },
  });
});
describe('private capture intake boundary', () => {
  it('refuses IDs that cannot be rated before storing capture bytes', async () => {
    for (const id of ['room study', 'a'.repeat(101), '__proto__']) {
      const invalid = {
        ...body,
        candidate: {
          ...body.candidate,
          reference: { ...body.candidate.reference, id },
        },
      };
      expect((await POST(request(invalid))).status).toBe(400);
    }
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it('authorizes before parsing or persisting and refuses cross-origin intake', async () => {
    mocks.gate.mockResolvedValue(
      NextResponse.json({ error: 'locked' }, { status: 403 })
    );
    expect((await POST(request())).status).toBe(403);
    expect(mocks.ingest).not.toHaveBeenCalled();
    mocks.gate.mockResolvedValue(null);
    expect((await POST(request(body, 'https://other.test'))).status).toBe(403);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it('rejects caller ownership, generated material and invalid payloads before intake', async () => {
    for (const value of [
      { ...body, tenantId: 'other' },
      {
        ...body,
        candidate: {
          ...body.candidate,
          media: { ...body.candidate.media, generated: true },
        },
      },
      { ...body, base64: 'not base64!' },
    ])
      expect((await POST(request(value))).status).toBe(400);
    expect(mocks.ingest).not.toHaveBeenCalled();
  });
  it('derives the private actor scope, decodes bytes and returns only the safe projection', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { ...scope, tenantId: 'test-actor' },
        revision: 0,
        bytes: Buffer.from([1, 2, 3]),
      })
    );
    const value = await response.json();
    expect(value).toHaveProperty('items');
    expect(value).not.toHaveProperty('scope');
    expect(value).not.toHaveProperty('commands');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it('reports a stale revision or failed verification without claiming intake succeeded', async () => {
    mocks.ingest.mockRejectedValue(new ReferenceConflict('stale'));
    expect((await POST(request())).status).toBe(409);
    mocks.ingest.mockRejectedValue(new Error('digest mismatch'));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Capture could not be verified or saved.',
    });
  });
});
