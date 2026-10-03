import { z } from 'zod';
import {
  AGENT_DRAFT_TOOLS,
  agentJson,
  agentOriginAllowed,
  executeAgentDraftTool,
  guardAgentRequest,
  readAgentJson,
  reportAgentFailure,
} from '@/lib/agent-acquisition/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const messageSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string().max(200), z.number().finite()]).optional(),
  method: z.string().max(100),
  params: z.record(z.string(), z.unknown()).optional(),
});
const callSchema = z.object({
  name: z.string(),
  arguments: z.unknown().optional(),
});
const rpcError = (
  code: number,
  message: string,
  id: string | number | null = null,
  status = 400
) => agentJson({ jsonrpc: '2.0', id, error: { code, message } }, status);

/** Stateless JSON Streamable HTTP; drafts carry their own scoped capability. */
export async function POST(request: Request) {
  let requestId: string | number | null = null;
  try {
    const blocked = await guardAgentRequest(request);
    if (blocked) return blocked;
    const version = request.headers.get('mcp-protocol-version');
    if (version && !VERSIONS.includes(version))
      return rpcError(-32600, 'Unsupported MCP protocol version');
    const body = await readAgentJson(request);
    if (!body.ok)
      return rpcError(
        -32700,
        'Invalid JSON request',
        null,
        body.response.status
      );
    const parsed = messageSchema.safeParse(body.data);
    if (!parsed.success) return rpcError(-32600, 'Invalid JSON-RPC request');
    const { id, method, params } = parsed.data;
    requestId = id ?? null;
    if (id === undefined) {
      // Notifications never execute a mutation, even if named tools/call.
      return method === 'notifications/initialized' ||
        method === 'notifications/cancelled'
        ? new Response(null, {
            status: 202,
            headers: { 'Cache-Control': 'no-store' },
          })
        : rpcError(-32600, 'Unsupported notification');
    }
    const ok = (result: unknown) => agentJson({ jsonrpc: '2.0', id, result });
    if (method === 'initialize')
      return ok({
        protocolVersion:
          typeof params?.protocolVersion === 'string' &&
          VERSIONS.includes(params.protocolVersion)
            ? params.protocolVersion
            : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'jovie-artist-drafts', version: '1.0.0' },
        instructions:
          'Resolve an exact public creator profile, create an unpublished workspace, then prepare a release launch draft. Preserve acquisition fields. Keep draft_token private. Ownership, publishing and purchases require a separate verified human handoff; these tools grant none of those permissions.',
      });
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools: AGENT_DRAFT_TOOLS });
    if (method !== 'tools/call')
      return rpcError(-32601, 'Method not found', id, 200);
    const call = callSchema.safeParse(params);
    if (
      !call.success ||
      !AGENT_DRAFT_TOOLS.some(tool => tool.name === call.data.name)
    )
      return rpcError(-32602, 'Unknown tool or invalid arguments', id, 200);
    const writeBlocked = await guardAgentRequest(request, true);
    if (writeBlocked) return writeBlocked;
    const result = await executeAgentDraftTool(
      call.data.name,
      call.data.arguments
    );
    return ok({
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
      isError: result.status === 'error',
    });
  } catch {
    await reportAgentFailure();
    return rpcError(-32603, 'Service unavailable; retry later', requestId, 503);
  }
}

export function GET(request: Request) {
  return agentOriginAllowed(request)
    ? new Response(null, {
        status: 405,
        headers: { Allow: 'POST', 'Cache-Control': 'no-store' },
      })
    : rpcError(-32600, 'Origin not allowed', null, 403);
}
