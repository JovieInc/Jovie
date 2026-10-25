import { BASE_URL } from '@/constants/app';
import {
  AGENT_DISCOVERY_HEADERS,
  buildAiCatalog,
} from '@/lib/agent-ready/discovery';

/** ARD ai-catalog manifest. */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildAiCatalog(BASE_URL), {
    headers: AGENT_DISCOVERY_HEADERS,
  });
}
