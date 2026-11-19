/**
 * Audit watcher for the Vercel Board shadow mirror (one-week pilot;
 * workers/mesh-hub/BOARD-PILOT.md). Registers watcher `mesh_tasks_audit` with
 * `tail: 'mesh/tasks'` on first use and writes NOTHING to the board: `run`
 * only logs one structured line per event, whose `wakeAt − eventAt` is
 * Board's wake latency and whose `eventAt − hubAt` is the hub→Board
 * end-to-end lag. The compare script (scripts/mesh/board-pilot-compare.mjs)
 * and Vercel logs read these lines.
 *
 * `[[...path]]` keeps the route mounted so the SDK's watcher transport can
 * wake it (the proxy matcher excludes exactly these paths). The handler is a
 * pure passthrough to the board handle's own fetch — the transport authenticates
 * with the deployment's OIDC, which must reach it untouched.
 */
import { board } from '@vercel/board';
import {
  auditLine,
  MESH_CHANNEL,
} from '@/app/api/internal/mesh-board-mirror/mapping';
import { type AccessPolicy, defineRoute } from '@/lib/api/route-pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WATCHER_ID = 'mesh_tasks_audit';

const team = board({
  watch: {
    [WATCHER_ID]: {
      tail: MESH_CHANNEL,
      // Audit only: never write here (not even a reaction) — the pilot's
      // board stays a pure mirror of the hub's stages.
      run: ({ event }) => {
        console.log(auditLine(event));
      },
    },
  },
});

/** Production only: a preview deployment must never register the watcher. */
const watcherAccess: AccessPolicy<null> = {
  name: 'mesh-board-watcher',
  async authorize() {
    return process.env.VERCEL_ENV === 'production'
      ? { ok: true, auth: null }
      : { ok: false, status: 404, body: { ok: false, code: 'not_found' } };
  },
};

const passthrough = ({ request }: { request: Request }): Promise<Response> =>
  team.fetch(request);

export const GET = defineRoute(
  { route: '/api/internal/mesh-board', access: watcherAccess },
  passthrough
);
export const POST = defineRoute(
  { route: '/api/internal/mesh-board', access: watcherAccess },
  passthrough
);
