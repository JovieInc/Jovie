import { readFile } from 'node:fs/promises';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/middleware';
import { resolveScreenshotPath } from '@/lib/admin/screenshots';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  // Screenshot assets are a read-only extension of the role-gated admin page.
  // Requiring a fresh MFA entitlement here made the page render while every
  // image failed with 403. Mutating admin APIs remain MFA-gated.
  const authError = await requireAdmin();
  if (authError) return authError;

  const { filename } = await params;
  const filePath = resolveScreenshotPath(decodeURIComponent(filename));

  if (!filePath) {
    return NextResponse.json(
      { error: 'Invalid screenshot identifier' },
      { status: 400 }
    );
  }

  try {
    const buffer = await readFile(filePath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    captureError('Failed to read screenshot file', error, {
      route: '/api/admin/screenshots/[filename]',
      filename,
    });
    return NextResponse.json(
      { error: 'Screenshot not found' },
      { status: 404 }
    );
  }
}
