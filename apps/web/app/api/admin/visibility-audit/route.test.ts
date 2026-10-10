import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/admin/middleware', () => ({
  requireAdmin: mocks.requireAdmin,
}));

import { NextResponse } from 'next/server';
import { TIM_WHITE_VISIBILITY_AUDIT_INPUT } from '@/lib/visibility-audit/fixtures/tim-white';
import { GET, POST } from './route';

describe('/api/admin/visibility-audit', () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
  });

  it('rejects callers who are not admins', async () => {
    mocks.requireAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );
    const response = await GET(
      new Request('https://jov.ie/api/admin/visibility-audit')
    );
    expect(response.status).toBe(403);
  });

  it('returns the Tim sample markdown for an admin', async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const response = await GET(
      new Request('https://jov.ie/api/admin/visibility-audit?format=markdown')
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('Digital Footprint & Visibility Audit');
    expect(body).toContain('https://jov.ie/tim');
    expect(body).toContain('SerpAPI requests: 0');
  });

  it('rejects a snapshot that is not an audit input', async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const response = await POST(
      new Request('https://jov.ie/api/admin/visibility-audit', {
        method: 'POST',
        body: JSON.stringify({ artistName: '' }),
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(response.status).toBe(400);
  });

  it('assembles a parsed snapshot while dropping caller-supplied guard fields', async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const response = await POST(
      new Request('https://jov.ie/api/admin/visibility-audit', {
        method: 'POST',
        body: JSON.stringify({
          ...TIM_WHITE_VISIBILITY_AUDIT_INPUT,
          popularity: 87,
          serpApiRequests: 10,
          searchOwnership: [
            {
              query: 'Tim White',
              rank: 1,
              url: 'https://jov.ie/tim',
              owned: true,
              serpApiRequests: 10,
            },
          ],
          catalogMismatches: [
            {
              isrc: 'USAAA1234567',
              mismatchType: 'missing_from_dsp',
              status: 'flagged',
              providerId: 'spotify',
              popularity: 87,
              followers: 1200,
            },
          ],
        }),
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const { report } = await response.json();
    expect(report.searchOwnership.serpApiRequests).toBe(0);
    expect(report.catalog.mismatches).toEqual([
      {
        isrc: 'USAAA1234567',
        mismatchType: 'missing_from_dsp',
        status: 'flagged',
        providerId: 'spotify',
        externalTrackName: null,
        externalAlbumName: null,
      },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/"popularity"|"followers"/);
  });
});
