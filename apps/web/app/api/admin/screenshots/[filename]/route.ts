import { readFile } from 'node:fs/promises';
import { type NextRequest, NextResponse } from 'next/server';
import { resolveScreenshotPath } from '@/lib/admin/screenshots';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const entitlements = await getCurrentUserEntitlements();

  if (!entitlements.isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!entitlements.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
  } catch {
    return NextResponse.json(
      { error: 'Screenshot not found' },
      { status: 404 }
    );
  }
}
