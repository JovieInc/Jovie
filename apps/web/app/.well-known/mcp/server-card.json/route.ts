import { BASE_URL } from '@/constants/app';
import {
  AGENT_DISCOVERY_HEADERS,
  buildMcpServerCard,
} from '@/lib/agent-ready/discovery';

/** MCP Server Card (SEP-1649) for the anonymous music identity server. */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildMcpServerCard(BASE_URL), {
    headers: AGENT_DISCOVERY_HEADERS,
  });
}
