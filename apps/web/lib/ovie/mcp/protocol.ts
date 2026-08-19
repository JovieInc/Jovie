import type { JsonRpcId, JsonRpcRequest } from './types';

export function parseJsonRpc(body: unknown): JsonRpcRequest | null {
  if (!body || typeof body !== 'object') return null;
  const rec = body as Record<string, unknown>;
  if (rec.jsonrpc !== undefined && rec.jsonrpc !== '2.0') return null;
  return {
    jsonrpc: typeof rec.jsonrpc === 'string' ? rec.jsonrpc : undefined,
    id: rec.id as JsonRpcId | undefined,
    method: typeof rec.method === 'string' ? rec.method : undefined,
    params: rec.params,
  };
}

export function rpcOk(id: JsonRpcId | undefined, result: unknown) {
  return { jsonrpc: '2.0' as const, id: id ?? null, result };
}

export function rpcError(
  id: JsonRpcId | undefined,
  code: number,
  message: string
) {
  return { jsonrpc: '2.0' as const, id: id ?? null, error: { code, message } };
}
