#!/usr/bin/env tsx
import {
  validateLiveRobotsTxt,
  validateLiveSitemapXml,
} from '@/lib/seo/ratchet';

interface CliOptions {
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

function parseCliArgs(argv: readonly string[]): CliOptions {
  let baseUrl = process.env.BASE_URL?.trim() || 'https://jov.ie';
  let timeoutMs = 15_000;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
      continue;
    }
    if (arg === '--base-url') {
      baseUrl = argv[++index] ?? baseUrl;
      continue;
    }
    if (arg.startsWith('--timeout-ms=')) {
      timeoutMs = Number.parseInt(arg.slice('--timeout-ms='.length), 10);
      continue;
    }
    if (arg === '--timeout-ms') {
      timeoutMs = Number.parseInt(argv[++index] ?? `${timeoutMs}`, 10);
    }
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    timeoutMs,
  };
}

function printUsage() {
  console.log(`Usage: pnpm --filter @jovie/web run seo:ratchet:live [--base-url=https://jov.ie]

Checks live robots.txt and sitemap.xml against the SEO/AEO ratchet baseline.
`);
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, application/xml, text/xml, */*',
      'Cache-Control': 'no-cache',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }

  return response.text();
}

async function main() {
  const { baseUrl, timeoutMs } = parseCliArgs(process.argv.slice(2));
  const robotsUrl = `${baseUrl}/robots.txt`;
  const sitemapUrl = `${baseUrl}/sitemap.xml`;

  const [robotsText, sitemapXml] = await Promise.all([
    fetchText(robotsUrl, timeoutMs),
    fetchText(sitemapUrl, timeoutMs),
  ]);

  const issues = [
    ...validateLiveRobotsTxt(robotsText),
    ...validateLiveSitemapXml(sitemapXml),
  ];

  if (issues.length === 0) {
    console.log(`SEO/AEO ratchet passed for ${baseUrl}`);
    return;
  }

  console.error(`SEO/AEO ratchet failed for ${baseUrl}:`);
  for (const issue of issues) {
    console.error(`- [${issue.code}] ${issue.message}`);
    if (issue.remediation) {
      console.error(`  ↳ ${issue.remediation}`);
    }
  }
  process.exitCode = 1;
}

main().catch(error => {
  console.error('SEO/AEO live ratchet check crashed:', error);
  process.exitCode = 1;
});
