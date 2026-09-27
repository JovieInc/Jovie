import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { resolveAppPath } from '@/lib/filesystem-paths';
import {
  getInvestorPortalAccess,
  INVESTOR_PRIVATE_HEADERS,
} from '@/lib/investors/portal-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exact deck files served from apps/web/assets/investor-deck. An allowlist,
 * not a filesystem lookup: nothing outside this table is reachable, so there
 * is no path to traverse.
 */
const INVESTOR_DECK_FILES: Readonly<Record<string, string>> = {
  'Jovie-Pitch-Deck.pdf': 'application/pdf',
};

interface RouteContext {
  readonly params: Promise<{ path: string[] }>;
}

function notFound(): Response {
  return new Response(null, { status: 404, headers: INVESTOR_PRIVATE_HEADERS });
}

/**
 * GET /investor-portal/deck/<file>
 * Same gate as the portal (investor link cookie or admin session), enforced
 * here as well as in proxy.ts. The PDF is streamed: Vercel caps buffered
 * function responses at 4.5 MB.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  const file = (await params).path.join('/');
  const contentType = Object.hasOwn(INVESTOR_DECK_FILES, file)
    ? INVESTOR_DECK_FILES[file]
    : undefined;

  if (!contentType || !(await getInvestorPortalAccess())) return notFound();

  const filePath = resolveAppPath('assets', 'investor-deck', file);
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return notFound();
  }

  const headers = {
    ...INVESTOR_PRIVATE_HEADERS,
    'Content-Type': contentType,
    'Content-Length': String(size),
    'Content-Disposition': `attachment; filename="${file}"`,
    'X-Content-Type-Options': 'nosniff',
  };
  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(body, { headers });
}
