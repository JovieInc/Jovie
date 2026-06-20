import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureWebScreenshot } from './screenshots';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('captureWebScreenshot', () => {
  it('fails closed when Cloudflare credentials are missing', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'taste-inbox-'));
    const result = await captureWebScreenshot({
      url: 'https://staging.jov.ie/',
      outputPath: path.join(dir, 'shot.png'),
      apiToken: undefined,
      accountId: undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CLOUDFLARE/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('writes png bytes from Cloudflare Browser Rendering', async () => {
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        pngHeader.buffer.slice(
          pngHeader.byteOffset,
          pngHeader.byteOffset + pngHeader.byteLength
        ),
    });

    const dir = await mkdtemp(path.join(os.tmpdir(), 'taste-inbox-'));
    const outputPath = path.join(dir, 'shot.png');

    const result = await captureWebScreenshot({
      url: 'https://staging.jov.ie/',
      outputPath,
      apiToken: 'token',
      accountId: 'account',
    });

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account/browser-rendering/screenshot',
      expect.objectContaining({ method: 'POST' })
    );

    const written = await readFile(outputPath);
    expect(written.subarray(0, 8)).toEqual(pngHeader);
  });
});
