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
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
      deployedAt: process.env.VERCEL_DEPLOYMENT_TIME || Date.now(),
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      environment: process.env.VERCEL_ENV,
    });
  } catch {
    // Fallback if BUILD_ID not available (file may not exist in development)
    return NextResponse.json({
      buildId: 'unknown',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
      deployedAt: Date.now(),
      environment: process.env.VERCEL_ENV,
    });
  }
}
