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
 * is no path to traverse. Relative asset URLs in the HTML deck resolve here.
 */
const INVESTOR_DECK_FILES: Readonly<Record<string, string>> = {
  'Jovie-Pitch-Deck.pdf': 'application/pdf',
  'index.html': 'text/html; charset=utf-8',
  'compact.html': 'text/html; charset=utf-8',
  'print.html': 'text/html; charset=utf-8',
  'market-funnel-slide.html': 'text/html; charset=utf-8',
  'deck-stage.js': 'text/javascript; charset=utf-8',
  'colors_and_type.css': 'text/css; charset=utf-8',
  'assets/album-all-noise.png': 'image/png',
  'assets/album-deep-end.png': 'image/png',
  'assets/album-never-say.png': 'image/png',
  'assets/album-take-me-over.png': 'image/png',
  'assets/product-releases.png': 'image/png',
  'assets/tim-universal.png': 'image/png',
  'assets/logo-icon-black-upload.svg': 'image/svg+xml',
  'assets/logo-icon-white.svg': 'image/svg+xml',
  'assets/logo-wordmark-black.svg': 'image/svg+xml',
  'assets/logo-wordmark-white.svg': 'image/svg+xml',
};

interface RouteContext {
  readonly params: Promise<{ path: string[] }>;
}

function notFound(): Response {
  return new Response(null, { status: 404, headers: INVESTOR_PRIVATE_HEADERS });
}

/**
 * GET /investor-portal/deck/<file>
 * Same gate as the portal (investor link cookie or admin session). Most deck
 * URLs carry a static-file extension that proxy.ts skips, so this handler is
 * the only gate for them. The PDF is streamed: Vercel caps buffered function
 * responses at 4.5 MB.
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

  const headers: Record<string, string> = {
    ...INVESTOR_PRIVATE_HEADERS,
    'Content-Type': contentType,
    'Content-Length': String(size),
    'X-Content-Type-Options': 'nosniff',
  };
  if (file.endsWith('.pdf')) {
    headers['Content-Disposition'] = `attachment; filename="${file}"`;
  }

  const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(body, { headers });
}
