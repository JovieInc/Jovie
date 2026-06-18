#!/usr/bin/env tsx

import { fetchAndValidateSeoGuardrails } from '@/lib/seo/guardrail-check';

function parseArgs(argv: string[]): { baseUrl: string } {
  let baseUrl = process.env.BASE_URL ?? process.env.DEPLOYMENT_URL ?? '';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base-url') {
      baseUrl = argv[index + 1] ?? baseUrl;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: seo-guardrail-check.ts --base-url <url>

Validates production-shaped robots.txt and sitemap.xml on a live deployment.
Fails loud when crawlers would be globally blocked or sitemap health regresses.

Environment:
  BASE_URL / DEPLOYMENT_URL  Default base URL when --base-url is omitted.
`);
      process.exit(0);
    }
  }

  if (!baseUrl) {
    console.error(
      'seo-guardrail-check: missing --base-url (or BASE_URL / DEPLOYMENT_URL).'
    );
    process.exit(1);
  }

  return { baseUrl };
}

async function main(): Promise<void> {
  const { baseUrl } = parseArgs(process.argv.slice(2));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const { robots, sitemap } = await fetchAndValidateSeoGuardrails(baseUrl, {
      signal: controller.signal,
    });

    const failures = [...robots.errors, ...sitemap.errors];
    if (failures.length === 0) {
      console.log(`✅ SEO guardrails passed for ${baseUrl}`);
      return;
    }

    console.error(`❌ SEO guardrails failed for ${baseUrl}`);
    for (const finding of failures) {
      console.error(`- [${finding.code}] ${finding.message}`);
      console.error(`  Fix: ${finding.remediation}`);
    }
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
}

main().catch(error => {
  console.error('seo-guardrail-check: unexpected error', error);
  process.exit(1);
});
