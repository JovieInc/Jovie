import { serializeRobots } from '@/lib/agent-ready/discovery';
import robots from '../../robots';

/**
 * Served as /robots.txt through a beforeFiles rewrite in next.config.js.
 * app/robots.ts stays the single source of crawl rules (and of the SEO
 * ratchets that read it); this route only serializes those rules and adds the
 * Content-Signal line, which Next's metadata robots type cannot express.
 */
export const revalidate = false;
export const dynamic = 'force-static';

export function GET() {
  return new Response(serializeRobots(robots()), {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
