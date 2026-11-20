import { describe, expect, it, vi } from 'vitest';
import { readModelContext, registerJovieWebMcpTools } from './web-mcp';

function setup(fetchImpl: typeof fetch) {
  let tool: any;
  const context = {
    registerTool: vi.fn((definition: unknown) => {
      tool = definition;
      return Promise.resolve();
    }),
  };
  registerJovieWebMcpTools(context, fetchImpl);
  return { tool, context };
}

describe('WebMCP tools', () => {
  it('registers one read-only tool with a handle schema', () => {
    const { tool, context } = setup(vi.fn() as unknown as typeof fetch);
    expect(context.registerTool).toHaveBeenCalledTimes(1);
    expect(tool.name).toBe('get_public_creator_profile');
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.inputSchema.required).toEqual(['username']);
  });

  it('rejects handles that could change the request path', async () => {
    const fetchImpl = vi.fn();
    const { tool } = setup(fetchImpl as unknown as typeof fetch);
    for (const bad of ['../api/admin', 'a/b', '', 42, 'x'.repeat(31)]) {
      const result = await tool.execute({ username: bad });
      expect(result.content[0].text).toBe('Invalid handle.');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reads the anonymous API without credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}'));
    const { tool } = setup(fetchImpl as unknown as typeof fetch);
    const result = await tool.execute({ username: 'tim' });
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/tim', {
      headers: { accept: 'application/json' },
      credentials: 'omit',
    });
    expect(result.content[0].text).toBe('{"ok":true}');
  });

  it('maps 404 to a plain message', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const { tool } = setup(fetchImpl as unknown as typeof fetch);
    expect((await tool.execute({ username: 'nobody' })).content[0].text).toBe(
      'No public profile found.'
    );
  });

  it('feature-detects document then navigator and tolerates absence', () => {
    const registerTool = vi.fn();
    expect(
      readModelContext(
        {} as Document,
        { modelContext: { registerTool } } as never
      )
    ).not.toBeNull();
    expect(readModelContext({} as Document, {} as Navigator)).toBeNull();
  });
});
