import { describe, expect, it } from 'vitest';

import {
  isLowValueSpanName,
  LOW_VALUE_SPAN_FILTERS,
  LOW_VALUE_SPAN_NAME_PATTERNS,
} from '@/lib/sentry/low-value-spans';

describe('LOW_VALUE_SPAN_FILTERS (JOV-6109)', () => {
  it('exposes one { name } ignoreSpans entry per pattern', () => {
    expect(LOW_VALUE_SPAN_FILTERS).toHaveLength(
      LOW_VALUE_SPAN_NAME_PATTERNS.length
    );
    for (const [index, filter] of LOW_VALUE_SPAN_FILTERS.entries()) {
      expect(filter.name).toBe(LOW_VALUE_SPAN_NAME_PATTERNS[index]);
    }
  });
});

describe('isLowValueSpanName', () => {
  it.each([
    // CORS preflights and bare HEAD monitors
    'OPTIONS /api/chat',
    'OPTIONS /api/stripe/webhook',
    'HEAD /tim',
    // Unauthenticated crawler/fetcher targets
    'GET /favicon.ico',
    'GET /robots.txt',
    'GET /sitemap.xml',
    'GET /sitemap-0.xml',
    'GET /manifest.webmanifest',
    'GET /apple-touch-icon.png',
    'GET /.well-known/openid-configuration',
    'GET /_next/image?url=%2Fimg.png&w=640&q=75',
    'GET /_next/data/build-id/tim.json',
    // Next.js OTel bookkeeping spans
    'BaseServer.handleRequest',
    'BaseServer.run',
    'NextNodeServer.findPageComponents',
    'NextNodeServer.createComponentTree',
    'NextNodeServer.clientComponentLoading',
    'NextNodeServer.compression',
    'NextServer.getRequestHandler',
    'build component tree',
    'client component loading',
    'resolve page components',
    'resolve route modules',
    'resolve metadata',
    'resolve page metadata',
    'start response',
    'waitForAvailableStream',
    'responseCache.get',
    'responseCache.set',
  ])('drops low-value span %j', name => {
    expect(isLowValueSpanName(name)).toBe(true);
  });

  it.each([
    // Real request transactions stay sampled
    'GET /api/chat',
    'POST /api/stripe/webhook',
    'GET /tim',
    'GET /api/health', // dropped by tracesSampler, not this filter
    'POST /pipeline', // dropped by tracesSampler (JOV-3666)
    // User-code and handler spans stay in the waterfall
    'executing api route (app) /api/chat/route',
    'generateMetadata /tim',
    'use cache getFeaturedCreators',
    'NextNodeServer.renderToResponse',
    'NextNodeServer.runApi',
    'db.query creator_profiles',
  ])('keeps meaningful span %j', name => {
    expect(isLowValueSpanName(name)).toBe(false);
  });

  it('treats missing names as not low-value', () => {
    expect(isLowValueSpanName(undefined)).toBe(false);
    expect(isLowValueSpanName(null)).toBe(false);
    expect(isLowValueSpanName('')).toBe(false);
  });
});
