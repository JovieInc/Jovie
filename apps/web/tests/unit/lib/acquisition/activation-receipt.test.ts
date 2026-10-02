import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachFirstTouchReceipt } from '@/lib/acquisition/activation-receipt';
import {
  buildFirstTouch,
  sealFirstTouchEnvelope,
} from '@/lib/acquisition/first-touch-envelope';

const { mockCaptureError, mockInsert, mockReturning, mockCookies } = vi.hoisted(
  () => ({
    mockCaptureError: vi.fn(),
    mockInsert: vi.fn(),
    mockReturning: vi.fn(),
    mockCookies: vi.fn(),
  })
);

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}));

vi.mock('@/lib/db', () => ({
  db: { insert: mockInsert },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

const SECRET = 'b'.repeat(32);
const USER_ID = '11111111-2222-3333-4444-555555555555';

function cookieStoreWith(value?: string) {
  return Promise.resolve({
    get: (name: string) => (value ? { name, value } : undefined),
  });
}

function lastInsertValues() {
  return mockInsert.mock.results.at(-1)?.value.values.mock.calls[0][0];
}

describe('attachFirstTouchReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LEAD_ATTRIBUTION_SECRET = SECRET;

    mockReturning.mockResolvedValue([{ id: 'receipt-id' }]);
    mockInsert.mockImplementation(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({ returning: mockReturning })),
      })),
    }));
  });

  it('records an explicit unknown receipt when no envelope exists', async () => {
    mockCookies.mockReturnValue(cookieStoreWith());

    await expect(attachFirstTouchReceipt(USER_ID)).resolves.toBe(true);

    const values = lastInsertValues();
    expect(values.userId).toBe(USER_ID);
    expect(values.firstTouch).toEqual({
      channel: 'unknown',
      source: 'unknown',
    });
    expect(values.consentState).toBe('passive_attribution');
    expect(values.linkedAt).toBeInstanceOf(Date);
  });

  it('maps a signed AI-labelled UTM envelope onto the receipt', async () => {
    const capturedAt = Date.now() - 60_000;
    const envelope = buildFirstTouch(
      {
        url: new URL(
          'https://jov.ie/signup?utm_source=ChatGPT&utm_medium=ai&utm_campaign=launch'
        ),
        referer: 'https://chatgpt.com/c/abc',
      },
      capturedAt
    );
    const sealed = await sealFirstTouchEnvelope(envelope);
    mockCookies.mockReturnValue(cookieStoreWith(sealed ?? undefined));

    await expect(attachFirstTouchReceipt(USER_ID)).resolves.toBe(true);

    const values = lastInsertValues();
    expect(values.id).toBe(envelope.id);
    expect(values.userId).toBe(USER_ID);
    expect(values.firstTouch).toEqual({
      channel: 'campaign',
      source: 'chatgpt',
      medium: 'ai',
      campaign: 'launch',
      term: undefined,
      content: undefined,
      referrer: 'chatgpt.com',
      routeKind: 'signup',
      landingPath: undefined,
    });
    expect(values.capturedAt).toEqual(new Date(capturedAt));
    expect(values.linkedAt).toBeInstanceOf(Date);
  });

  it('records unknown when the envelope is tampered with', async () => {
    const sealed = await sealFirstTouchEnvelope(
      buildFirstTouch({ url: new URL('https://jov.ie/?utm_source=chatgpt') })
    );
    const tampered = `${sealed?.slice(0, -4)}ffff`;
    mockCookies.mockReturnValue(cookieStoreWith(tampered));

    await attachFirstTouchReceipt(USER_ID);

    expect(lastInsertValues().firstTouch.channel).toBe('unknown');
  });

  it('is idempotent: a unique-index conflict means the receipt already exists', async () => {
    mockReturning.mockResolvedValue([]);
    mockCookies.mockReturnValue(cookieStoreWith());

    await expect(attachFirstTouchReceipt(USER_ID)).resolves.toBe(false);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('swallows and reports persistence failures instead of failing activation', async () => {
    mockCookies.mockReturnValue(cookieStoreWith());
    mockInsert.mockImplementation(() => {
      throw new Error('db down');
    });

    await expect(attachFirstTouchReceipt(USER_ID)).resolves.toBe(false);
    expect(mockCaptureError).toHaveBeenCalled();
  });
});
