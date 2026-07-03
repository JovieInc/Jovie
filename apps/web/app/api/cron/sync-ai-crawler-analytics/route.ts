import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { syncAiCrawlerAnalytics } from '@/lib/services/ai-crawler-analytics/sync';

export const runtime = 'nodejs';
export const maxDuration = 120;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export async function syncAiCrawlerAnalyticsCron() {
  return syncAiCrawlerAnalytics();
}

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/sync-ai-crawler-analytics',
  });
  if (authError) {
    return authError;
  }

  const result = await syncAiCrawlerAnalyticsCron();

  return NextResponse.json(result, {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
}
