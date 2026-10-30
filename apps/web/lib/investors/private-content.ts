import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { investorPortalContent } from '@/lib/db/schema/investors';

/**
 * Investor portal content (memos, manifest, deck PDF) is private. The source of
 * truth is JovieInc/Ops (jovie-private/apps/web/{content/investors,
 * assets/investor-deck}); `scripts/investor-portal-sync.mjs` publishes it to the
 * `investor_portal_content` table, keyed by the path below apps/web. The app
 * has no private Blob store, so the existing database is the private store.
 *
 * Reads happen only behind the portal gate. Outside production, local dev may
 * read a checkout via INVESTOR_CONTENT_DIR (or JOVIE_PRIVATE_DIR/apps/web).
 */

const SAFE_RELATIVE_PATH =
  /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u;

export interface InvestorPrivateFile {
  readonly stream: ReadableStream<Uint8Array>;
  readonly contentType: string;
  readonly size: number | null;
}

export class InvestorContentMissingError extends Error {
  readonly code = 'ENOENT';
  constructor(relativePath: string) {
    super(`Investor content not found: ${relativePath}`);
  }
}

function assertSafe(relativePath: string): void {
  if (!SAFE_RELATIVE_PATH.test(relativePath) || relativePath.includes('..')) {
    throw new InvestorContentMissingError(relativePath);
  }
}

function localRoot(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const explicit = process.env.INVESTOR_CONTENT_DIR?.trim();
  if (explicit) return explicit;
  const privateDir = process.env.JOVIE_PRIVATE_DIR?.trim();
  return privateDir ? path.join(privateDir, 'apps', 'web') : null;
}

/** Opens one private investor file. Throws InvestorContentMissingError (ENOENT) when absent. */
export async function openInvestorPrivateFile(
  relativePath: string,
  contentType: string
): Promise<InvestorPrivateFile> {
  assertSafe(relativePath);
  const root = localRoot();
  if (root) {
    const filePath = path.join(root, relativePath);
    try {
      const info = await fs.stat(filePath);
      return {
        stream: Readable.toWeb(
          createReadStream(filePath)
        ) as ReadableStream<Uint8Array>,
        contentType,
        size: info.size,
      };
    } catch {
      // Fall through to the database so a partial local checkout still works.
    }
  }
  let row: { bodyBase64: string; contentType: string } | undefined;
  try {
    [row] = await db
      .select({
        bodyBase64: investorPortalContent.bodyBase64,
        contentType: investorPortalContent.contentType,
      })
      .from(investorPortalContent)
      .where(eq(investorPortalContent.path, relativePath))
      .limit(1);
  } catch (error) {
    // 42P01 undefined_table: the migration has not reached this database yet.
    // Treat as missing content (reported by the caller) rather than a 500.
    const code =
      (error as { code?: string; cause?: { code?: string } })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (code !== '42P01') throw error;
  }
  if (!row) throw new InvestorContentMissingError(relativePath);
  const bytes = Buffer.from(row.bodyBase64, 'base64');
  return {
    stream: new Response(bytes).body as ReadableStream<Uint8Array>,
    contentType: row.contentType || contentType,
    size: bytes.byteLength,
  };
}

/** Reads one private investor text file in full. */
export async function readInvestorPrivateText(
  relativePath: string
): Promise<string> {
  const file = await openInvestorPrivateFile(relativePath, 'text/plain');
  return new Response(file.stream).text();
}
