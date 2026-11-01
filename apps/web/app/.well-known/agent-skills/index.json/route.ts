import { BASE_URL } from '@/constants/app';
import {
  AGENT_DISCOVERY_HEADERS,
  buildAgentSkillsIndex,
} from '@/lib/agent-ready/discovery';

/** Agent Skills discovery index (v0.2.0); digests are of the served SKILL.md bytes. */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildAgentSkillsIndex(BASE_URL), {
    headers: AGENT_DISCOVERY_HEADERS,
  });
}
