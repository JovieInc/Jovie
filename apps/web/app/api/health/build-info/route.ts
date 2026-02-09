import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
  const environment = process.env.VERCEL_ENV;

  try {
    const buildId = readFileSync(
      join(process.cwd(), '.next/BUILD_ID'),
      'utf-8'
    ).trim();

    return NextResponse.json({
      buildId,
      version,
      deployedAt: process.env.VERCEL_DEPLOYMENT_TIME || Date.now(),
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      environment,
    });
  } catch {
    return NextResponse.json({
      buildId: 'unknown',
      version,
      deployedAt: Date.now(),
      environment,
    });
  }
}
