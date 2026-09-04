import { beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({
  get: vi.fn(),
  head: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  get: blob.get,
  head: blob.head,
  list: blob.list,
  put: blob.put,
}));

import { BlobNotFoundError } from '@vercel/blob';
import {
  listImmutableShadowRecords,
  persistImmutableShadowRecord,
  readImmutableShadowRecord,
} from '../agent/lib/vercel-blob-shadow-store';

describe('immutable Summer shadow blob store', () => {
  beforeEach(() => {
    blob.get.mockReset();
    blob.head.mockReset();
    blob.list.mockReset();
    blob.put.mockReset();
  });

  it('creates a private, non-overwritable record at the exact pathname', async () => {
    blob.put.mockResolvedValue({ pathname: 'receipt.json' });

    await expect(
      persistImmutableShadowRecord('summer-shadow/receipts/key.json', {
        verdict: 'accepted',
      })
    ).resolves.toBe('created');

    expect(blob.put).toHaveBeenCalledWith(
      'summer-shadow/receipts/key.json',
      JSON.stringify({ verdict: 'accepted' }),
      expect.objectContaining({
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json; charset=utf-8',
      })
    );
  });

  it('classifies an uncertain put with an existing path as a replay', async () => {
    blob.put.mockRejectedValue(new Error('uncertain put result'));
    blob.head.mockResolvedValue({ pathname: 'receipt.json' });

    await expect(
      persistImmutableShadowRecord('summer-shadow/receipts/key.json', {})
    ).resolves.toBe('exists');
  });

  it('preserves the write failure when no durable record can be proven', async () => {
    const writeError = new Error('put failed');
    blob.put.mockRejectedValue(writeError);
    blob.head.mockRejectedValue(new BlobNotFoundError());

    await expect(
      persistImmutableShadowRecord('summer-shadow/receipts/key.json', {})
    ).rejects.toBe(writeError);
  });

  it('preserves the write failure when the confirmation read also fails', async () => {
    const writeError = new Error('put failed');
    blob.put.mockRejectedValue(writeError);
    blob.head.mockRejectedValue(new Error('head unavailable'));

    await expect(
      persistImmutableShadowRecord('summer-shadow/receipts/key.json', {})
    ).rejects.toBe(writeError);
  });

  it('reads a bounded private immutable record without cache', async () => {
    const body = JSON.stringify({ verdict: 'accepted' });
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: new Response(body).body,
      blob: { size: Buffer.byteLength(body) },
    });

    await expect(
      readImmutableShadowRecord('summer-bottleneck/events/key.json')
    ).resolves.toEqual({ verdict: 'accepted' });
    expect(blob.get).toHaveBeenCalledWith(
      'summer-bottleneck/events/key.json',
      expect.objectContaining({ access: 'private', useCache: false })
    );
  });

  it('lists and reads immutable records under the exact prefix', async () => {
    blob.list.mockResolvedValue({
      blobs: [
        { pathname: 'summer-bottleneck/events/a.json' },
        { pathname: 'summer-bottleneck/events/b.json' },
      ],
    });
    blob.get
      .mockResolvedValueOnce({
        statusCode: 200,
        stream: new Response('{"eventId":"a"}').body,
        blob: { size: 15 },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        stream: new Response('{"eventId":"b"}').body,
        blob: { size: 15 },
      });

    await expect(
      listImmutableShadowRecords('summer-bottleneck/events/')
    ).resolves.toEqual([
      {
        pathname: 'summer-bottleneck/events/a.json',
        record: { eventId: 'a' },
      },
      {
        pathname: 'summer-bottleneck/events/b.json',
        record: { eventId: 'b' },
      },
    ]);
    expect(blob.list).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 25,
        prefix: 'summer-bottleneck/events/',
      })
    );
  });

  it('fails closed for missing, unavailable, oversized, or malformed records', async () => {
    blob.get.mockResolvedValueOnce(null);
    await expect(readImmutableShadowRecord('missing.json')).resolves.toBeNull();

    blob.get.mockResolvedValueOnce({
      statusCode: 503,
      stream: null,
      blob: { size: 0 },
    });
    await expect(readImmutableShadowRecord('unavailable.json')).rejects.toThrow(
      'immutable shadow record is unavailable or oversized'
    );

    blob.get.mockResolvedValueOnce({
      statusCode: 200,
      stream: new Response('{}').body,
      blob: { size: 65 * 1024 },
    });
    await expect(readImmutableShadowRecord('oversized.json')).rejects.toThrow(
      'immutable shadow record is unavailable or oversized'
    );

    blob.get.mockResolvedValueOnce({
      statusCode: 200,
      stream: new Response('[]').body,
      blob: { size: 2 },
    });
    await expect(readImmutableShadowRecord('malformed.json')).rejects.toThrow(
      'immutable shadow record is malformed'
    );
  });
});
