#!/usr/bin/env tsx
/**
 * Live SEO/AEO ratchet guard (#11044).
 *
 * Fetches robots.txt + sitemap.xml from a deployed origin and fails loud on:
 * - global Disallow: /
 * - missing sitemap reference / AI crawler allows
 * - empty or lastmod-less sitemap entries
 *
 * Usage:
 *   BASE_URL=https://jov.ie pnpm --filter @jovie/web run test:seo:http
 *   BASE_URL=https://staging.jov.ie pnpm --filter @jovie/web run test:seo:http
 */

import process from 'node:process';
import { validateLiveSeoEndpoints } from '@/lib/seo/robots-http-guard';

function getBaseUrl(): string {
  const raw = process.env.BASE_URL?.trim();
  if (!raw) {
    throw new Error('BASE_URL is required (e.g. https://jov.ie)');
  }
  return new URL(raw).origin;
}

async function main(): Promise<void> {
  const baseUrl = getBaseUrl();
  console.log(`🔍 SEO ratchet HTTP guard — ${baseUrl}`);

  const { robots, sitemap } = await validateLiveSeoEndpoints(baseUrl);
  const violations = [...robots.violations, ...sitemap.violations];

  if (violations.length === 0) {
    console.log(
      `✅ robots.txt + sitemap.xml healthy (${sitemap.urlCount} sitemap URLs)`
    );
    return;
  }

  console.error('❌ SEO ratchet violations:');
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exitCode = 1;
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
