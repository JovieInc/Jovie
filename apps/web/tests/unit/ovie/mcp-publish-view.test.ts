import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishMock = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/views/service.server', async () => {
  class PublishViewError extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message);
    }
  }
  return { PublishViewError, publishView: publishMock };
});

import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import { callOvieMcpTool, listOvieMcpTools } from '@/lib/ovie/mcp/tools';
import { OvieMcpInputError } from '@/lib/ovie/mcp/types';

const USER_ID = '2f1c5d0e-6a3b-4c7d-8e9f-0a1b2c3d4e5f';
const principal = {
  authenticated: true,
  isAdmin: true,
  scopes: ['ovie:read', 'ovie:write'] as const,
  subject: USER_ID,
};
const spec = {
  schema: 'jovie.view.v1',
  title: 'T',
  blocks: [{ type: 'text', body: 'hi' }],
};

describe('publish_view tool', () => {
  beforeEach(() => publishMock.mockReset());

  it('is listed with the share-link description', () => {
    const tool = listOvieMcpTools().find(t => t.name === 'publish_view');
    expect(tool?.description).toContain('get a share link');
  });

  it('publishes as the principal subject and returns id, version, url', async () => {
    publishMock.mockResolvedValue({
      id: 'v1',
      version: 2,
      token: 't',
      url: 'https://jov.ie/v/t',
    });
    const result = await callOvieMcpTool(
      new MemoryOperatingStore(),
      principal,
      'publish_view',
      { spec, created_by: 'summer' }
    );
    expect(result).toEqual({
      ok: true,
      result: { id: 'v1', version: 2, url: 'https://jov.ie/v/t' },
    });
    expect(publishMock).toHaveBeenCalledWith({
      ownerUserId: USER_ID,
      viewId: undefined,
      spec,
      createdBy: 'summer',
    });
  });

  it('rejects a principal without an app user subject', async () => {
    await expect(
      callOvieMcpTool(
        new MemoryOperatingStore(),
        { ...principal, subject: undefined },
        'publish_view',
        { spec }
      )
    ).rejects.toBeInstanceOf(OvieMcpInputError);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('requires ovie:write', async () => {
    const result = await callOvieMcpTool(
      new MemoryOperatingStore(),
      { ...principal, scopes: ['ovie:read'] },
      'publish_view',
      { spec }
    );
    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});
