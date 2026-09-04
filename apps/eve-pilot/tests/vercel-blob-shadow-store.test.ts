import { beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({
  head: vi.fn(),
  put: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  head: blob.head,
  put: blob.put,
}));

import { BlobNotFoundError } from '@vercel/blob';
import { persistImmutableShadowRecord } from '../agent/lib/vercel-blob-shadow-store';

describe('immutable Summer shadow blob store', () => {
  beforeEach(() => {
    blob.head.mockReset();
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
});
