import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  try {
    // Read buildId from .next/BUILD_ID
    const buildId = readFileSync(
      join(process.cwd(), '.next/BUILD_ID'),
      'utf-8'
    ).trim();

    return NextResponse.json({
      buildId,
      deployedAt: process.env.VERCEL_DEPLOYMENT_TIME || Date.now(),
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      environment: process.env.VERCEL_ENV,
    });
  } catch (_error) {
    // Fallback if BUILD_ID not available
    return NextResponse.json({
      buildId: 'unknown',
      deployedAt: Date.now(),
      environment: process.env.VERCEL_ENV,
    });
  }
}
