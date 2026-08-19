import { parseJsonRpc, rpcError, rpcOk } from './protocol';
import type { OperatingStore } from './store';
import { getDefaultOperatingStore } from './store';
import { callOvieMcpTool, listOvieMcpTools } from './tools';
import {
  type JsonRpcRequest,
  OVIE_MCP_IDENTITY,
  OVIE_MCP_PROTOCOL_VERSION,
  OVIE_MCP_SERVER_NAME,
  type OvieMcpPrincipal,
} from './types';

export const UNAUTHENTICATED_WWW_AUTHENTICATE =
  'Bearer realm="ovie", resource_metadata="/.well-known/oauth-protected-resource/api/ovie/mcp"';

export type OvieMcpHandleResult = {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
};

export function handleOvieMcpRequest(input: {
  readonly body: unknown;
  readonly principal: OvieMcpPrincipal;
  readonly store?: OperatingStore;
}): OvieMcpHandleResult {
  const store = input.store ?? getDefaultOperatingStore();
  const parsed = parseJsonRpc(input.body);
  if (!parsed || !parsed.method) {
    return { status: 200, body: rpcError(null, -32700, 'Parse error') };
  }

  if (!input.principal.authenticated) {
    return {
      status: 401,
      body: rpcError(parsed.id, -32001, 'authentication required'),
      headers: { 'www-authenticate': UNAUTHENTICATED_WWW_AUTHENTICATE },
    };
  }

  try {
    return dispatchAuthenticated(parsed, input.principal, store);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal error';
    return { status: 200, body: rpcError(parsed.id, -32602, message) };
  }
}

function dispatchAuthenticated(
  request: JsonRpcRequest,
  principal: OvieMcpPrincipal,
  store: OperatingStore
): OvieMcpHandleResult {
  const id = request.id;
  switch (request.method) {
    case 'initialize':
      return {
        status: 200,
        body: rpcOk(id, {
          protocolVersion: OVIE_MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: {
            name: OVIE_MCP_SERVER_NAME,
            version: '1.0.0',
            identity: OVIE_MCP_IDENTITY,
          },
        }),
      };
    case 'notifications/initialized':
      return { status: 202, body: null };
    case 'tools/list':
      return {
        status: 200,
        body: rpcOk(id, { tools: listOvieMcpTools() }),
      };
    case 'tools/call': {
      const params = (request.params ?? {}) as Record<string, unknown>;
      const name = typeof params.name === 'string' ? params.name : '';
      const args =
        params.arguments && typeof params.arguments === 'object'
          ? (params.arguments as Record<string, unknown>)
          : {};
      const called = callOvieMcpTool(store, principal, name, args);
      if (!called.ok) {
        if (called.status === 401 || called.status === 403) {
          return {
            status: called.status,
            body: rpcError(id, -32001, called.message),
          };
        }
        return { status: 200, body: rpcError(id, -32602, called.message) };
      }
      return {
        status: 200,
        body: rpcOk(id, {
          content: [{ type: 'text', text: JSON.stringify(called.result) }],
          structuredContent: called.result,
        }),
      };
    }
    default:
      return {
        status: 200,
        body: rpcError(id, -32601, `Method not found: ${request.method}`),
      };
  }
}
