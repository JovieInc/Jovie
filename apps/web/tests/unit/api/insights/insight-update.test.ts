import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSessionContextMock: vi.fn(),
  updateInsightStatusMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionContext: hoisted.getSessionContextMock,
}));

vi.mock('@/lib/services/insights/lifecycle', () => ({
  updateInsightStatus: hoisted.updateInsightStatusMock,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureExceptionMock,
}));

vi.mock('@/lib/http/headers', () => ({
  NO_STORE_HEADERS: { 'Cache-Control': 'no-store' },
}));

describe('PATCH /api/insights/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validUUID = '00000000-0000-0000-0000-000000000001';
  const makeParams = (id: string) => Promise.resolve({ id });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSessionContextMock.mockRejectedValue(new Error('Unauthorized'));

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/' + validUUID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    const response = await PATCH(request, { params: makeParams(validUUID) });

    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid UUID', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/not-a-uuid', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    const response = await PATCH(request, { params: makeParams('not-a-uuid') });

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/' + validUUID, {
      method: 'PATCH',
      body: 'not json',
    });
    const response = await PATCH(request, { params: makeParams(validUUID) });

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid status value', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/' + validUUID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'invalid_status' }),
    });
    const response = await PATCH(request, { params: makeParams(validUUID) });

    expect(response.status).toBe(400);
  });

  it('returns 404 when insight not found', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.updateInsightStatusMock.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/' + validUUID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    const response = await PATCH(request, { params: makeParams(validUUID) });

    expect(response.status).toBe(404);
  });

  it('successfully updates insight status', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.updateInsightStatusMock.mockResolvedValue({
      id: validUUID,
      status: 'dismissed',
    });

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/' + validUUID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    const response = await PATCH(request, { params: makeParams(validUUID) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it('accepts acted_on status', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.updateInsightStatusMock.mockResolvedValue({ id: validUUID });

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/' + validUUID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'acted_on' }),
    });
    const response = await PATCH(request, { params: makeParams(validUUID) });

    expect(response.status).toBe(200);
    expect(hoisted.updateInsightStatusMock).toHaveBeenCalledWith(
      validUUID,
      'profile_123',
      'acted_on'
    );
  });

  it('returns 500 on unexpected error', async () => {
    hoisted.getSessionContextMock.mockResolvedValue({
      profile: { id: 'profile_123' },
    });
    hoisted.updateInsightStatusMock.mockRejectedValue(new Error('DB error'));

    const { PATCH } = await import('@/app/api/insights/[id]/route');
    const request = new Request('http://localhost/api/insights/' + validUUID, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
    const response = await PATCH(request, { params: makeParams(validUUID) });

    expect(response.status).toBe(500);
    expect(hoisted.captureExceptionMock).toHaveBeenCalled();
  });
});
