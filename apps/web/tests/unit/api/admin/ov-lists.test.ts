import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  getSidebarLists: vi.fn(),
  getListDetail: vi.fn(),
  suggestForList: vi.fn(),
  insertList: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  search: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: mocks.access,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/ovie/lists/service.server', () => ({
  getSidebarLists: mocks.getSidebarLists,
  getListDetail: mocks.getListDetail,
  suggestForList: mocks.suggestForList,
}));
vi.mock('@/lib/ovie/lists/list-store.server', () => ({
  insertList: mocks.insertList,
  updateList: mocks.updateList,
  deleteList: mocks.deleteList,
}));
vi.mock('@/lib/ovie/lists/creators.server', () => ({
  searchListCreators: mocks.search,
}));

import * as ListRoute from '@/app/api/admin/ov-lists/[id]/route';
import * as SuggestRoute from '@/app/api/admin/ov-lists/[id]/suggest/route';
import * as CreatorsRoute from '@/app/api/admin/ov-lists/creators/route';
import * as ListsRoute from '@/app/api/admin/ov-lists/route';
import { ListModelError } from '@/lib/ovie/lists/model';

const CREATOR = '6f1c2b0e-7a4d-4c55-9a62-1f4f7d9b2c11';
const ctx = { params: Promise.resolve({ id: 'list-1' }) };

function req(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`https://jov.ie${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('ovie lists API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(null);
  });

  it('denies before any data when the Ovie gate refuses', async () => {
    const denial = new Response(null, { status: 403 });
    mocks.access.mockResolvedValue(denial);
    const responses = await Promise.all([
      ListsRoute.GET(),
      ListsRoute.POST(req('/api/admin/ov-lists', 'POST', { name: 'Press' })),
      ListRoute.GET(req('/api/admin/ov-lists/list-1'), ctx),
      ListRoute.PATCH(req('/api/admin/ov-lists/list-1', 'PATCH', {}), ctx),
      ListRoute.DELETE(req('/api/admin/ov-lists/list-1', 'DELETE'), ctx),
      SuggestRoute.POST(req('/api/admin/ov-lists/list-1/suggest', 'POST'), ctx),
      CreatorsRoute.GET(req('/api/admin/ov-lists/creators?q=a')),
    ]);
    expect(responses.every(r => r === denial)).toBe(true);
    for (const fn of [
      mocks.getSidebarLists,
      mocks.getListDetail,
      mocks.suggestForList,
      mocks.insertList,
      mocks.updateList,
      mocks.deleteList,
      mocks.search,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('returns the sidebar payload uncached', async () => {
    mocks.getSidebarLists.mockResolvedValue({ lists: [], smartViews: [] });
    const response = await ListsRoute.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ lists: [], smartViews: [] });
  });

  it('maps model validation errors to 400 on create', async () => {
    mocks.insertList.mockRejectedValue(
      new ListModelError('List name is required.')
    );
    const response = await ListsRoute.POST(
      req('/api/admin/ov-lists', 'POST', { name: '   ' })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'List name is required.' });
  });

  it('applies validated swipe actions and rejects client-injected suggestions', async () => {
    mocks.updateList.mockResolvedValue({
      outcome: 'updated',
      list: { id: 'list-1' },
    });
    const ok = await ListRoute.PATCH(
      req('/api/admin/ov-lists/list-1', 'PATCH', {
        actions: [{ type: 'swipe', creatorId: CREATOR, direction: 'right' }],
      }),
      ctx
    );
    expect(ok.status).toBe(200);
    expect(mocks.updateList).toHaveBeenCalledWith('list-1', [
      { type: 'swipe', creatorId: CREATOR, direction: 'right' },
    ]);

    const injected = await ListRoute.PATCH(
      req('/api/admin/ov-lists/list-1', 'PATCH', {
        actions: [{ type: 'suggest', suggestions: [] }],
      }),
      ctx
    );
    expect(injected.status).toBe(400);
    expect(mocks.updateList).toHaveBeenCalledTimes(1);
  });

  it('surfaces CAS conflicts as 409 so the client can retry', async () => {
    mocks.updateList.mockResolvedValue({ outcome: 'conflict' });
    const response = await ListRoute.PATCH(
      req('/api/admin/ov-lists/list-1', 'PATCH', {
        actions: [{ type: 'rate', creatorId: CREATOR, rating: 4 }],
      }),
      ctx
    );
    expect(response.status).toBe(409);
  });

  it('suggests through the learner service and 404s unknown lists', async () => {
    mocks.suggestForList.mockResolvedValue({ outcome: 'not_found' });
    const response = await SuggestRoute.POST(
      req('/api/admin/ov-lists/list-1/suggest', 'POST'),
      ctx
    );
    expect(response.status).toBe(404);
    expect(mocks.suggestForList).toHaveBeenCalledWith('list-1');
  });
});
