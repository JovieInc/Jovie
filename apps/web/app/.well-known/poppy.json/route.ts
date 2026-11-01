import {
  AGENT_DISCOVERY_HEADERS,
  buildPoppyManifest,
} from '@/lib/agent-ready/discovery';

/** Personal Agent Protocol website-only discovery. Declares no sessions. */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildPoppyManifest(), {
    headers: AGENT_DISCOVERY_HEADERS,
  });
}
