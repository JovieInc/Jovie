import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  withFailSoftToolExecute,
  wrapToolSetFailSoft,
} from '@/lib/chat/wrap-tool-execute';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}));

describe('wrap-tool-execute', () => {
  it('returns structured failure instead of throwing', async () => {
    const execute = withFailSoftToolExecute('retouchImage', async () => {
      throw new Error('Retouch is not provisioned for this account.');
    });

    const result = await execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'TOOL_UNPROVISIONED',
      retryable: true,
    });
  });

  it('normalizes success:false payloads from execute', async () => {
    const execute = withFailSoftToolExecute('generateAlbumArt', async () => ({
      success: false as const,
      error: 'Album art generation is temporarily unavailable.',
      retryable: false,
    }));

    const result = await execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('wraps every tool in a tool set', async () => {
    const tools = wrapToolSetFailSoft({
      demoTool: tool({
        description: 'demo',
        inputSchema: z.object({}),
        execute: async () => {
          throw new Error('demo failed');
        },
      }),
    });

    const result = await tools.demoTool.execute?.({}, {} as never);

    expect(result).toMatchObject({
      success: false,
      errorCode: 'TOOL_EXECUTION_FAILED',
    });
  });
});
