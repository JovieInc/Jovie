import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { referenceScopeKey } from '@/lib/agent-os/design-reference-corpus/adaptive/engine';
import {
  scope,
  session,
} from '@/lib/agent-os/design-reference-corpus/adaptive/fixtures.test-utils';
import { referencePreviewKey } from '@/lib/ovie/reference-review/intake';

const mocks = vi.hoisted(() => ({
  gate: vi.fn(),
  auth: vi.fn(),
  read: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.gate,
}));
vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mocks.auth }));
vi.mock('@/lib/agent-os/design-reference-corpus/adaptive/repository', () => ({
  readReferenceSession: mocks.read,
}));
vi.mock('@/lib/ovie/reference-review/store.server', () => ({
  referenceRepository: { readPreview: mocks.preview },
}));

import { GET } from './route';

const ownedScope = { ...scope, tenantId: 'test-actor' };
const bytes = Buffer.from('Synthetic preview transport fixture');
const sha256 = createHash('sha256').update(bytes).digest('hex');
function request(id = 'ref-001') {
  return new Request(
    `https://example.test/api/admin/reference-review/preview?contextId=editorial&branchId=main&referenceId=${id}&tenantId=other`
  );
}
function preview(patch: Record<string, unknown> = {}) {
  return {
    schema: 'jovie.reference-preview/v1',
    scopeKey: referenceScopeKey(ownedScope),
    sha256,
    contentType: 'image/png',
    base64: bytes.toString('base64'),
    ...patch,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gate.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ userId: 'test-actor', sessionId: 'session' });
  const state = session(1);
  state.scope = ownedScope;
  state.media['ref-001'].sha256 = sha256;
  state.media['ref-001'].previewSlot = 0;
  mocks.read.mockResolvedValue(state);
  mocks.preview.mockResolvedValue(preview());
});
describe('authenticated private reference previews', () => {
  it('serves an eligible source beyond the screen top25', async () => {
    const state = session(51);
    state.scope = ownedScope;
    for (const id of Object.keys(state.media)) state.ratings[id] = 5;
    state.media['ref-026'].sha256 = sha256;
    state.media['ref-026'].previewSlot = 25;
    mocks.read.mockResolvedValue(state);
    expect((await GET(request('ref-026'))).status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(
      referencePreviewKey(ownedScope, 25)
    );
  });
  it('refuses a locked session before any data access', async () => {
    mocks.gate.mockResolvedValue(
      NextResponse.json({ error: 'locked' }, { status: 403 })
    );
    expect((await GET(request())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('serves exact bytes with private headers using actor ownership and a fixed slot', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(mocks.read).toHaveBeenCalledWith(expect.anything(), ownedScope);
    expect(mocks.preview).toHaveBeenCalledWith(
      referencePreviewKey(ownedScope, 0)
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });
  it('refuses unknown, unverified and foreign preview records', async () => {
    expect((await GET(request('unknown'))).status).toBe(404);
    expect(mocks.preview).not.toHaveBeenCalled();
    mocks.preview.mockResolvedValue(
      preview({
        scopeKey: referenceScopeKey({ ...ownedScope, tenantId: 'other' }),
      })
    );
    expect((await GET(request())).status).toBe(404);
    const state = await mocks.read();
    state.media['ref-001'].verification = 'unverified';
    mocks.read.mockResolvedValue(state);
    expect((await GET(request())).status).toBe(404);
  });
  it('fails closed on altered bytes and non-raster content types', async () => {
    mocks.preview.mockResolvedValue(
      preview({ base64: Buffer.from('altered').toString('base64') })
    );
    expect((await GET(request())).status).toBe(503);
    mocks.preview.mockResolvedValue(preview({ contentType: 'text/html' }));
    expect((await GET(request())).status).toBe(503);
  });
});
