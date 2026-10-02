import 'server-only';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BASE_URL } from '@/constants/app';
import {
  assertNeutralToolResult,
  type LinkResult,
  linkResultSchema,
  makeLinkInputSchema,
} from './contract';
import { createSmartLink } from './create-link';
import { resolveLinkActor } from './principal';
import { createSmartLinkResolver } from './resolve';
import { createSmartLinkStore } from './store';

function toolResult(result: LinkResult): CallToolResult {
  assertNeutralToolResult(result);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    structuredContent: result,
    isError: result.status === 'error' || result.status === 'not_found',
  };
}

/** Shared by /api/chatgpt/mcp and /api/music/mcp. Same quota as POST /api/links. */
export async function callMakeLink(
  request: Request,
  args: unknown
): Promise<CallToolResult> {
  const input = makeLinkInputSchema.safeParse(args);
  if (!input.success) {
    return toolResult({ status: 'error', code: 'UNSUPPORTED_INPUT' });
  }
  const actor = await resolveLinkActor(request);
  const result = await createSmartLink({
    query: input.data.query,
    ...(input.data.kind ? { kind: input.data.kind } : {}),
    origin: new URL(BASE_URL).origin,
    actor,
    store: createSmartLinkStore(),
    resolver: createSmartLinkResolver(),
  });
  return toolResult(linkResultSchema.parse(result));
}
