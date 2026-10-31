import { BASE_URL } from '@/constants/app';
import {
  AGENT_DISCOVERY_HEADERS,
  buildApiCatalog,
} from '@/lib/agent-ready/discovery';

/** RFC 9727 API catalog. */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(buildApiCatalog(BASE_URL)), {
    headers: {
      ...AGENT_DISCOVERY_HEADERS,
      'Content-Type': 'application/linkset+json',
    },
  });
}
