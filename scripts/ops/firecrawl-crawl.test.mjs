import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  'firecrawl-crawl.sh'
);
const run = (args, env) =>
  spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    ...(env && { env }),
  });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'fc-'));
  const urls = join(dir, 'urls.txt');
  const reg = join(dir, 'reg.json');
  writeFileSync(urls, 'https://x/a\nhttps://x/b\nhttps://x/c\nhttps://x/a\n');
  writeFileSync(
    reg,
    JSON.stringify({
      version: 1,
      pages: {
        'https://x/a': {
          lastCrawledAt: new Date().toISOString(),
          contentHash: 'h',
        },
        'https://x/b': {
          lastCrawledAt: '2020-01-01T00:00:00Z',
          contentHash: 'h',
        },
      },
    })
  );
  return { dir, urls, reg };
}

test('diff: new + stale URLs are due; fresh + dupes are not', () => {
  const { dir, urls, reg } = fixture();
  try {
    const r = run(['diff', urls, reg, '--max-age-days', '7']);
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.deepEqual(d.due.sort(), ['https://x/b', 'https://x/c']);
    assert.deepEqual(d.fresh, ['https://x/a']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diff: empty registry marks every mapped URL due (first crawl)', () => {
  const { dir, urls } = fixture();
  const reg = join(dir, 'missing.json');
  try {
    const r = run(['diff', urls, reg]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).due.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diff: repeat run after a fresh crawl returns an empty delta', () => {
  const { dir, urls } = fixture();
  const reg = join(dir, 'r.json');
  try {
    writeFileSync(
      reg,
      JSON.stringify({
        version: 1,
        pages: Object.fromEntries(
          ['a', 'b', 'c'].map(p => [
            `https://x/${p}`,
            { lastCrawledAt: new Date().toISOString(), contentHash: 'h' },
          ])
        ),
      })
    );
    const r = run(['diff', urls, reg]);
    assert.equal(JSON.parse(r.stdout).due.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects bad sitemap, unknown flags, and bad limit', () => {
  const bad = run(['crawl', 'https://x', '--sitemap', 'nope']);
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--sitemap/);
  assert.match(run(['crawl', 'https://x', '--wat']).stderr, /unknown/);
  assert.match(run(['crawl', 'https://x', '--limit', '0']).stderr, /--limit/);
});

test('map/crawl require a URL and the API key', () => {
  assert.match(run(['map']).stderr, /missing/);
  const r = run(['crawl', 'https://x'], { PATH: process.env.PATH });
  assert.match(r.stderr, /FIRECRAWL_API_KEY/);
  assert.notEqual(r.status, 0);
});
