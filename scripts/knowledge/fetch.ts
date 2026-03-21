/**
 * Knowledge Canon — Fetch Script
 *
 * Fetches raw reference material from trusted music industry sources
 * into a local .cache/ directory for subsequent distillation.
 *
 * Usage: doppler run -- pnpm tsx scripts/knowledge/fetch.ts
 *
 * Features:
 * - Resume support: skips already-fetched files
 * - Exponential backoff on 429/5xx
 * - QA gate: drops empty/junk extractions
 * - Provenance manifest for internal auditing
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, '.cache');
const MANIFEST_PATH = join(CACHE_DIR, 'manifest.json');
const QA_MIN_LENGTH = 100;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const PROGRESS_INTERVAL = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestEntry {
  id: string;
  url: string;
  source: string;
  fetchedAt: string;
  qaStatus?: 'passed' | 'dropped';
  qaReason?: string;
}

type Manifest = ManifestEntry[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadManifest(): Manifest {
  if (existsSync(MANIFEST_PATH)) {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  }
  return [];
}

function saveManifest(manifest: Manifest): void {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function getNextId(manifest: Manifest): number {
  if (manifest.length === 0) return 1;
  const maxId = Math.max(...manifest.map(e => Number.parseInt(e.id, 10)));
  return maxId + 1;
}

function padId(n: number): string {
  return String(n).padStart(4, '0');
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; KnowledgeBot/1.0; internal research)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeout);

      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const delay = BASE_DELAY_MS * 2 ** attempt;
          console.log(
            `  [retry] ${res.status} for ${url}, waiting ${delay}ms (attempt ${attempt + 1}/${retries})`
          );
          await sleep(delay);
          continue;
        }
        console.warn(
          `  [fail] ${res.status} for ${url} after ${retries} retries`
        );
        return null;
      }

      if (!res.ok) {
        console.warn(`  [skip] ${res.status} for ${url}`);
        return null;
      }

      return res;
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < retries) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        console.log(
          `  [retry] Error for ${url}: ${(err as Error).message}, waiting ${delay}ms`
        );
        await sleep(delay);
        continue;
      }
      console.warn(
        `  [fail] ${url}: ${(err as Error).message} after ${retries} retries`
      );
      return null;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractTextContent(html: string, selectors: string[]): string {
  const $ = cheerio.load(html);

  // Remove nav, header, footer, script, style, cookie banners
  $(
    'nav, header, footer, script, style, noscript, iframe, .cookie-banner, .cookie-consent, [role="banner"], [role="navigation"], [role="contentinfo"]'
  ).remove();

  // Try each selector in order, return first that has content
  for (const selector of selectors) {
    const el = $(selector);
    if (el.length > 0) {
      const text = el.text().replace(/\s+/g, ' ').trim();
      if (text.length > QA_MIN_LENGTH) {
        return text;
      }
    }
  }

  // Fallback: get body text
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  return bodyText;
}

function isAlreadyFetched(manifest: Manifest, url: string): boolean {
  return manifest.some(e => e.url === url);
}

// ---------------------------------------------------------------------------
// Source A: Spotify for Artists blog/guides (sitemap-based)
// ---------------------------------------------------------------------------

async function fetchSourceASitemap(): Promise<string[]> {
  console.log('\n[Source A] Fetching sitemap from artists.spotify.com...');

  const sitemapUrl = 'https://artists.spotify.com/sitemap.xml';
  const res = await fetchWithRetry(sitemapUrl);
  if (!res) {
    console.error('[Source A] Failed to fetch sitemap');
    return [];
  }

  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const urls: string[] = [];
  $('url > loc').each((_, el) => {
    const loc = $(el).text().trim();
    if (loc) urls.push(loc);
  });

  // Filter to content pages (blog posts, guides, tool pages)
  // Exclude: login, locale duplicates, assets, API endpoints
  const contentUrls = urls.filter(url => {
    const path = new URL(url).pathname;
    // Include blog posts, tool/feature pages, and educational content
    if (
      path.startsWith('/blog/') ||
      path.startsWith('/en/') ||
      path === '/new-releases' ||
      path.startsWith('/new-releases')
    ) {
      return true;
    }
    // Include top-level feature pages
    if (
      [
        '/canvas',
        '/clips',
        '/marquee',
        '/showcase',
        '/discovery-mode',
        '/countdown-pages',
        '/royalties',
        '/songwriting',
      ].some(p => path.startsWith(p))
    ) {
      return true;
    }
    return false;
  });

  console.log(
    `[Source A] Found ${urls.length} total URLs, ${contentUrls.length} content URLs after filtering`
  );
  return contentUrls;
}

async function fetchSourceAPages(
  urls: string[],
  manifest: Manifest
): Promise<number> {
  let fetched = 0;
  let skipped = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    if (isAlreadyFetched(manifest, url)) {
      skipped++;
      continue;
    }

    const res = await fetchWithRetry(url);
    if (!res) continue;

    const html = await res.text();
    const text = extractTextContent(html, [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.article-body',
      '.post-content',
    ]);

    const id = padId(getNextId(manifest));
    const filePath = join(CACHE_DIR, `${id}.txt`);
    writeFileSync(filePath, text);

    manifest.push({
      id,
      url,
      source: 'a',
      fetchedAt: new Date().toISOString(),
    });

    fetched++;

    if ((fetched + skipped) % PROGRESS_INTERVAL === 0) {
      console.log(
        `[Source A] Progress: ${fetched + skipped}/${urls.length} (${fetched} fetched, ${skipped} resumed)`
      );
      saveManifest(manifest);
    }

    // Rate limit
    await sleep(150);
  }

  console.log(`[Source A] Done: ${fetched} fetched, ${skipped} already cached`);
  saveManifest(manifest);
  return fetched;
}

// ---------------------------------------------------------------------------
// Source B: Spotify Support articles (category crawl)
// ---------------------------------------------------------------------------

async function fetchSourceBCategoryUrls(): Promise<string[]> {
  console.log('\n[Source B] Crawling support.spotify.com/us/artists/...');

  const baseUrl = 'https://support.spotify.com/us/artists/';
  const res = await fetchWithRetry(baseUrl);
  if (!res) {
    console.error('[Source B] Failed to fetch artist support index');
    return [];
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  // Collect all article links from the support hub
  const articleUrls = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    try {
      const resolved = new URL(href, baseUrl).href;
      // Only include support article pages under /us/artists/
      if (
        resolved.startsWith('https://support.spotify.com/us/artists/') &&
        resolved !== baseUrl &&
        !resolved.includes('#') &&
        !resolved.endsWith('/artists/')
      ) {
        articleUrls.add(resolved);
      }
    } catch {
      // Invalid URL, skip
    }
  });

  // Also crawl category pages for deeper links
  const categoryUrls = [...articleUrls].filter(
    url => url.split('/').filter(Boolean).length <= 6
  );

  for (const catUrl of categoryUrls) {
    const catRes = await fetchWithRetry(catUrl);
    if (!catRes) continue;

    const catHtml = await catRes.text();
    const $cat = cheerio.load(catHtml);

    $cat('a[href]').each((_, el) => {
      const href = $cat(el).attr('href');
      if (!href) return;

      try {
        const resolved = new URL(href, catUrl).href;
        if (
          resolved.startsWith('https://support.spotify.com/us/artists/') &&
          !resolved.includes('#')
        ) {
          articleUrls.add(resolved);
        }
      } catch {
        // skip
      }
    });

    await sleep(200);
  }

  console.log(`[Source B] Found ${articleUrls.size} article URLs`);
  return [...articleUrls];
}

async function fetchSourceBPages(
  urls: string[],
  manifest: Manifest
): Promise<number> {
  let fetched = 0;
  let skipped = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    if (isAlreadyFetched(manifest, url)) {
      skipped++;
      continue;
    }

    const res = await fetchWithRetry(url);
    if (!res) continue;

    const html = await res.text();
    const text = extractTextContent(html, [
      'article',
      '.article-content',
      'main',
      '[role="main"]',
      '.support-article',
    ]);

    const id = padId(getNextId(manifest));
    const filePath = join(CACHE_DIR, `${id}.txt`);
    writeFileSync(filePath, text);

    manifest.push({
      id,
      url,
      source: 'b',
      fetchedAt: new Date().toISOString(),
    });

    fetched++;

    if ((fetched + skipped) % PROGRESS_INTERVAL === 0) {
      console.log(
        `[Source B] Progress: ${fetched + skipped}/${urls.length} (${fetched} fetched, ${skipped} resumed)`
      );
      saveManifest(manifest);
    }

    await sleep(200);
  }

  console.log(`[Source B] Done: ${fetched} fetched, ${skipped} already cached`);
  saveManifest(manifest);
  return fetched;
}

// ---------------------------------------------------------------------------
// Source C: AWAL Academy (Playwright for JS-rendered pages)
// ---------------------------------------------------------------------------

async function fetchSourceCPages(manifest: Manifest): Promise<number> {
  console.log('\n[Source C] Fetching AWAL Academy via Playwright...');

  let playwright: typeof import('playwright');
  try {
    playwright = await import('playwright');
  } catch {
    console.error(
      '[Source C] Playwright not available. Skipping AWAL. Install with: pnpm add -D playwright'
    );
    return 0;
  }

  let browser: Awaited<ReturnType<typeof playwright.chromium.launch>>;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (err) {
    console.error(
      `[Source C] Playwright browsers not installed. Run: npx playwright install chromium\n  ${(err as Error).message}`
    );
    return 0;
  }
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  let fetched = 0;

  try {
    // Start from the Academy Articles section
    const academyUrl =
      'https://help.awal.com/hc/en-us/sections/7404195356435--Academy-Articles';

    const page = await context.newPage();

    // Navigate to academy section to find article links
    console.log('[Source C] Loading Academy section page...');
    await page.goto(academyUrl, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    // Collect article links
    const articleLinks = await page.evaluate(() => {
      const links: string[] = [];
      document.querySelectorAll('a[href*="/articles/"]').forEach(el => {
        const href = (el as HTMLAnchorElement).href;
        if (href.includes('/hc/en-us/articles/') && !links.includes(href)) {
          links.push(href);
        }
      });
      return links;
    });

    // Also check for additional help sections with distribution/promotion content
    const additionalSections = [
      'https://help.awal.com/hc/en-us/categories/7404130587027-Digital-Product-Builder',
      'https://help.awal.com/hc/en-us/categories/12108919649555-Digital-Distribution-and-Accounting',
    ];

    for (const sectionUrl of additionalSections) {
      try {
        await page.goto(sectionUrl, {
          waitUntil: 'networkidle',
          timeout: 30_000,
        });

        const moreLinks = await page.evaluate(() => {
          const links: string[] = [];
          document.querySelectorAll('a[href*="/articles/"]').forEach(el => {
            const href = (el as HTMLAnchorElement).href;
            if (href.includes('/hc/en-us/articles/') && !links.includes(href)) {
              links.push(href);
            }
          });
          return links;
        });

        articleLinks.push(...moreLinks.filter(l => !articleLinks.includes(l)));
      } catch (err) {
        console.warn(
          `[Source C] Failed to load section ${sectionUrl}: ${(err as Error).message}`
        );
      }

      await sleep(1000);
    }

    console.log(`[Source C] Found ${articleLinks.length} article URLs`);

    // Fetch each article
    for (const url of articleLinks) {
      if (isAlreadyFetched(manifest, url)) {
        continue;
      }

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });

        const text = await page.evaluate(() => {
          // Remove nav, footer, sidebar
          const remove = document.querySelectorAll(
            'nav, header, footer, .header, .footer, .sidebar, script, style'
          );
          for (const el of remove) el.remove();

          // Try to find the article body
          const article =
            document.querySelector('.article-body') ||
            document.querySelector('article') ||
            document.querySelector('main') ||
            document.querySelector('[role="main"]');

          if (article) {
            return article.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          }

          return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        });

        if (text.length < QA_MIN_LENGTH) {
          console.log(`  [skip] Empty/short content for ${url}`);
          continue;
        }

        const id = padId(getNextId(manifest));
        const filePath = join(CACHE_DIR, `${id}.txt`);
        writeFileSync(filePath, text);

        manifest.push({
          id,
          url,
          source: 'c',
          fetchedAt: new Date().toISOString(),
        });

        fetched++;

        if (fetched % 10 === 0) {
          console.log(`[Source C] Progress: ${fetched} articles fetched`);
          saveManifest(manifest);
        }
      } catch (err) {
        console.warn(
          `[Source C] Failed to fetch ${url}: ${(err as Error).message}`
        );
      }

      await sleep(1500);
    }
  } finally {
    await browser.close();
  }

  console.log(`[Source C] Done: ${fetched} articles fetched`);
  saveManifest(manifest);
  return fetched;
}

// ---------------------------------------------------------------------------
// QA Gate
// ---------------------------------------------------------------------------

interface QaSummary {
  total: number;
  passed: number;
  droppedEmpty: number;
  droppedJunk: number;
  droppedShort: number;
}

function runQaGate(manifest: Manifest): QaSummary {
  console.log('\n[QA] Running quality gate on fetched content...');

  const summary: QaSummary = {
    total: 0,
    passed: 0,
    droppedEmpty: 0,
    droppedJunk: 0,
    droppedShort: 0,
  };

  for (const entry of manifest) {
    if (entry.qaStatus) continue; // Already QA'd

    summary.total++;
    const filePath = join(CACHE_DIR, `${entry.id}.txt`);

    if (!existsSync(filePath)) {
      entry.qaStatus = 'dropped';
      entry.qaReason = 'file missing';
      summary.droppedEmpty++;
      continue;
    }

    const content = readFileSync(filePath, 'utf-8');

    // Check minimum length
    if (content.length < QA_MIN_LENGTH) {
      entry.qaStatus = 'dropped';
      entry.qaReason = `too short (${content.length} chars)`;
      summary.droppedShort++;
      continue;
    }

    // Check for low word count (nav-only or template placeholder pages)
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (wordCount < 30) {
      entry.qaStatus = 'dropped';
      entry.qaReason = `too few words (${wordCount})`;
      summary.droppedJunk++;
      continue;
    }

    entry.qaStatus = 'passed';
    summary.passed++;
  }

  saveManifest(manifest);
  return summary;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Knowledge Canon — Fetch ===\n');

  // Ensure cache directory exists
  mkdirSync(CACHE_DIR, { recursive: true });

  // Load or create manifest
  const manifest = loadManifest();
  const existingCount = manifest.length;

  if (existingCount > 0) {
    console.log(`Resuming from ${existingCount} previously fetched pages`);
  }

  // Fetch from all sources
  const sourceAUrls = await fetchSourceASitemap();
  const fetchedA = await fetchSourceAPages(sourceAUrls, manifest);

  const sourceBUrls = await fetchSourceBCategoryUrls();
  const fetchedB = await fetchSourceBPages(sourceBUrls, manifest);

  const fetchedC = await fetchSourceCPages(manifest);

  const totalNew = fetchedA + fetchedB + fetchedC;
  console.log(
    `\n=== Fetch complete: ${totalNew} new pages (${manifest.length} total) ===`
  );

  // Run QA gate
  const qa = runQaGate(manifest);

  console.log('\n=== QA Summary ===');
  console.log(`  Total files checked: ${qa.total}`);
  console.log(`  Passed:  ${qa.passed}`);
  console.log(
    `  Dropped: ${qa.droppedEmpty + qa.droppedJunk + qa.droppedShort}`
  );
  console.log(`    - Empty/missing: ${qa.droppedEmpty}`);
  console.log(`    - Too short:     ${qa.droppedShort}`);
  console.log(`    - Junk content:  ${qa.droppedJunk}`);

  const passRate =
    qa.total > 0 ? ((qa.passed / qa.total) * 100).toFixed(1) : '0';
  console.log(`  Pass rate: ${passRate}%`);

  // Count total passed (including previously QA'd)
  const totalPassed = manifest.filter(e => e.qaStatus === 'passed').length;

  if (totalPassed === 0) {
    console.error(
      '\n[ERROR] No content passed QA. Check extraction selectors.'
    );
    process.exit(1);
  }

  if (qa.total === 0) {
    console.log(
      `\n  (All ${totalPassed} entries already QA'd from previous run)`
    );
  }

  console.log(`\nManifest saved to ${MANIFEST_PATH}`);
  console.log(
    'Ready for distillation. Run: doppler run -- pnpm tsx scripts/knowledge/distill.ts'
  );
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
