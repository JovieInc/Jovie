import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authMock: vi.fn(),
  findFirstMock: vi.fn(),
  getMerchProductOptionsMock: vi.fn(),
  publishMerchCardMock: vi.fn(),
  selectMerchDesignMock: vi.fn(),
  updateMerchCardStatusMock: vi.fn(),
  insertValuesMock: vi.fn().mockResolvedValue(undefined),
  insertMock: vi
    .fn()
    .mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: hoisted.authMock,
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      creatorProfiles: {
        findFirst: hoisted.findFirstMock,
      },
    },
    insert: hoisted.insertMock,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
}));

vi.mock('@/lib/db/schema/chat', () => ({
  chatAuditLog: {},
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));

vi.mock('@/lib/merch/service', () => ({
  getMerchProductOptions: hoisted.getMerchProductOptionsMock,
  publishMerchCard: hoisted.publishMerchCardMock,
  selectMerchDesign: hoisted.selectMerchDesignMock,
  updateMerchCardStatus: hoisted.updateMerchCardStatusMock,
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/http/headers', () => ({
  NO_CACHE_HEADERS: { 'Cache-Control': 'no-store' },
}));
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

describe('POST /api/chat/confirm-merch-action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authMock.mockResolvedValue({ userId: 'user-1' });
    hoisted.findFirstMock.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
    });
    hoisted.publishMerchCardMock.mockResolvedValue({
      id: 'card-1',
      status: 'live',
      title: 'Tour Tee',
    });
    hoisted.getMerchProductOptionsMock.mockResolvedValue([
      {
        catalogProductId: 71,
        productName: 'Unisex Staple T-Shirt',
        productType: 't-shirt',
        colorway: 'Black',
      },
    ]);
    hoisted.selectMerchDesignMock.mockResolvedValue({
      success: true,
      merchCardId: '00000000-0000-4000-8000-000000000004',
      status: 'draft',
      selectedOptionId: '00000000-0000-4000-8000-000000000003',
      title: 'Tour Tee',
      publicUrl: null,
      product: {
        productType: 't-shirt',
        productName: 'Unisex Staple T-Shirt',
        colorway: 'Black',
        artworkUrl: 'https://blob.example.com/art.png',
        mockupUrl: null,
        mockupStatus: 'pending',
        retailPrice: '$30.00',
        artistProfit: '$10.00',
        publishEligible: true,
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.authMock.mockResolvedValue({ userId: null });
    const { POST } = await import('@/app/api/chat/confirm-merch-action/route');
    const response = await POST(
      new Request('http://localhost/api/chat/confirm-merch-action', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '00000000-0000-4000-8000-000000000001',
          merchCardId: '00000000-0000-4000-8000-000000000002',
          action: 'publish',
        }),
      })
    );
    expect(response.status).toBe(401);
  });

  it('publishes merch after ownership check', async () => {
    const { POST } = await import('@/app/api/chat/confirm-merch-action/route');
    const response = await POST(
      new Request('http://localhost/api/chat/confirm-merch-action', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '00000000-0000-4000-8000-000000000001',
          merchCardId: '00000000-0000-4000-8000-000000000002',
          action: 'publish',
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(hoisted.publishMerchCardMock).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body.status).toBe('live');
  });

  it('selects merch through the existing confirmation contract', async () => {
    const { POST } = await import('@/app/api/chat/confirm-merch-action/route');
    const response = await POST(
      new Request('http://localhost/api/chat/confirm-merch-action', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '00000000-0000-4000-8000-000000000001',
          generationId: '00000000-0000-4000-8000-000000000002',
          optionId: '00000000-0000-4000-8000-000000000003',
          optionNumber: 1,
          catalogProductId: 71,
          action: 'select',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.selectMerchDesignMock).toHaveBeenCalledWith({
      generationId: '00000000-0000-4000-8000-000000000002',
      clerkUserId: 'user-1',
      profileId: '00000000-0000-4000-8000-000000000001',
      optionId: '00000000-0000-4000-8000-000000000003',
      optionNumber: 1,
      catalogProductId: 71,
      publish: false,
    });
    const body = await response.json();
    expect(body.product).toMatchObject({
      mockupStatus: 'pending',
      mockupUrl: null,
      retailPrice: '$30.00',
      artistProfit: '$10.00',
    });
  });

  it('returns live product choices before creating the merch card', async () => {
    const { POST } = await import('@/app/api/chat/confirm-merch-action/route');
    const response = await POST(
      new Request('http://localhost/api/chat/confirm-merch-action', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '00000000-0000-4000-8000-000000000001',
          generationId: '00000000-0000-4000-8000-000000000002',
          optionId: '00000000-0000-4000-8000-000000000003',
          optionNumber: 1,
          action: 'products',
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(hoisted.getMerchProductOptionsMock).toHaveBeenCalledWith({
      generationId: '00000000-0000-4000-8000-000000000002',
      clerkUserId: 'user-1',
      profileId: '00000000-0000-4000-8000-000000000001',
      optionId: '00000000-0000-4000-8000-000000000003',
      optionNumber: 1,
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      products: [
        {
          catalogProductId: 71,
          productName: 'Unisex Staple T-Shirt',
          productType: 't-shirt',
          colorway: 'Black',
        },
      ],
    });
    expect(hoisted.selectMerchDesignMock).not.toHaveBeenCalled();
  });
});
