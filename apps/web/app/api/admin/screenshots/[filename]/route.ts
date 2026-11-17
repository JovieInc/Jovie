import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { resolveScreenshotPath } from '@/lib/admin/screenshots';
import {
  type OperatorRouteInput,
  operatorAccess,
} from '@/lib/api/route-access';
import { defineRoute } from '@/lib/api/route-pipeline';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

async function getHandler(
  _input: OperatorRouteInput,
  { params }: { params: Promise<{ filename: string }> }
) {
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

export const GET = defineRoute(
  {
    route: '/api/admin/screenshots/[filename]',
    access: operatorAccess({ purpose: 'read' }),
    legacy: { cache: 'none', unhandledErrors: 'rethrow' },
  },
  getHandler
);
