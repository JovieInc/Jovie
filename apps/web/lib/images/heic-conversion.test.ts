import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFetchWithTimeoutResponse, mockHeic2any } = vi.hoisted(() => ({
  mockFetchWithTimeoutResponse: vi.fn(),
  mockHeic2any: vi.fn(),
}));

vi.mock('heic2any', () => ({
  default: mockHeic2any,
}));

vi.mock('@/lib/queries/fetch', () => ({
  fetchWithTimeoutResponse: mockFetchWithTimeoutResponse,
}));

import { convertHeicToJpeg } from './heic-conversion';

describe('convertHeicToJpeg', () => {
  beforeEach(() => {
    mockFetchWithTimeoutResponse.mockReset();
    mockHeic2any.mockReset();
  });

  it('returns non-HEIC files unchanged', async () => {
    const jpeg = new File(['jpeg'], 'photo.jpg', { type: 'image/jpeg' });

    await expect(convertHeicToJpeg(jpeg)).resolves.toBe(jpeg);
    expect(mockHeic2any).not.toHaveBeenCalled();
    expect(mockFetchWithTimeoutResponse).not.toHaveBeenCalled();
  });

  it('falls back to server conversion when browser HEIC decoding fails', async () => {
    const heic = new File(['heic'], 'photo.heic', {
      type: 'image/heic',
      lastModified: 123,
    });
    mockHeic2any.mockRejectedValue(new Error('Unsupported HEIC variant'));
    // jsdom 30's Blob has no stream(), so undici's Response cannot read it;
    // raw bytes plus the content-type header model the same response.
    mockFetchWithTimeoutResponse.mockResolvedValue(
      new Response(new TextEncoder().encode('jpeg'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })
    );

    const converted = await convertHeicToJpeg(heic);

    expect(converted.name).toBe('photo.jpg');
    expect(converted.type).toBe('image/jpeg');
    expect(converted.lastModified).toBe(123);
    expect(mockFetchWithTimeoutResponse).toHaveBeenCalledWith(
      '/api/images/convert',
      expect.objectContaining({
        method: 'POST',
        timeout: 30_000,
      })
    );

    const requestOptions = mockFetchWithTimeoutResponse.mock.calls[0]?.[1] as
      | { body?: FormData }
      | undefined;
    expect(requestOptions?.body?.get('file')).toBe(heic);
  });
});
