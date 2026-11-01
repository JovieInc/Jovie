import {
  getInvestorPortalAccess,
  INVESTOR_PRIVATE_HEADERS,
} from '@/lib/investors/portal-access';
import { openInvestorPrivateFile } from '@/lib/investors/private-content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Exact deck files served from the private investor store (assets/investor-deck/). An allowlist,
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

  let deck: Awaited<ReturnType<typeof openInvestorPrivateFile>>;
  try {
    deck = await openInvestorPrivateFile(
      `assets/investor-deck/${file}`,
      contentType
    );
  } catch {
    return notFound();
  }

  const headers = {
    ...INVESTOR_PRIVATE_HEADERS,
    'Content-Type': deck.contentType,
    ...(deck.size === null ? {} : { 'Content-Length': String(deck.size) }),
    'Content-Disposition': `attachment; filename="${file}"`,
    'X-Content-Type-Options': 'nosniff',
  };
  return new Response(deck.stream, { headers });
}
