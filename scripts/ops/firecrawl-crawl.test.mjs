import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

// Hermetic: a fake curl on PATH stands in for Firecrawl, so no request leaves
// the machine. It logs each call and answers with v2-shaped bodies.
const FAKE_CURL = `#!/usr/bin/env bash
m=GET; u=; b=
while [ $# -gt 0 ]; do
  case "$1" in
    -X) m=$2; shift 2;;
    -H) shift 2;;
    -d) b=$2; shift 2;;
    -*) shift;;
    *) u=$1; shift;;
  esac
done
printf '%s %s %s\\n' "$m" "$u" "$b" >> "$FAKE_LOG"
case "$m $u" in
  "POST https://api.firecrawl.dev/v2/map")
    echo '{"success":true,"links":[{"url":"https://x/a","title":"A"},{"url":"https://x/b"}]}';;
  "POST https://api.firecrawl.dev/v2/batch/scrape")
    echo '{"success":true,"id":"job1","url":"https://api.firecrawl.dev/v2/batch/scrape/job1","invalidURLs":[]}';;
  "GET https://api.firecrawl.dev/v2/batch/scrape/job1")
    echo '{"status":"completed","total":2,"completed":2,"next":"https://api.firecrawl.dev/v2/batch/scrape/job1?skip=1","data":[{"markdown":"# A","metadata":{"sourceURL":"https://x/a","url":"https://x/a"}}]}';;
  "GET https://api.firecrawl.dev/v2/batch/scrape/job1?skip=1")
    echo '{"status":"completed","total":2,"completed":2,"next":null,"data":[{"markdown":"# B","metadata":{"sourceURL":"https://x/b","url":"https://x/b/"}}]}';;
  *) echo "unexpected $m $u" >&2; exit 22;;
esac
`;

test('crawl: v2 map + batch scrape, follows next pages, records every page', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-v2-'));
  try {
    const bin = join(dir, 'bin');
    spawnSync('mkdir', ['-p', bin]);
    writeFileSync(join(bin, 'curl'), FAKE_CURL);
    chmodSync(join(bin, 'curl'), 0o755);
    const log = join(dir, 'calls.log');
    const r = run(['crawl', 'https://x'], {
      PATH: `${bin}:${process.env.PATH}`,
      FIRECRAWL_API_KEY: 'test-key',
      FIRECRAWL_REGISTRY_DIR: join(dir, 'reg'),
      FIRECRAWL_POLL_S: '0',
      FAKE_LOG: log,
    });
    assert.equal(r.status, 0, r.stderr);
    const calls = readFileSync(log, 'utf8').trim().split('\n');
    assert.ok(
      calls.every(c => !c.includes('/v1/')),
      calls.join('\n')
    );
    const map = JSON.parse(calls[0].replace(/^POST \S+ /, ''));
    assert.equal(map.sitemap, 'include');
    assert.equal(map.ignoreQueryParameters, false);
    const batch = JSON.parse(calls[1].replace(/^POST \S+ /, ''));
    assert.deepEqual(batch.urls, ['https://x/a', 'https://x/b']);
    assert.deepEqual(batch.formats, ['markdown']);
    assert.equal(batch.maxAge, 0);
    assert.equal(calls.length, 4);
    const reg = JSON.parse(readFileSync(join(dir, 'reg', 'x.json'), 'utf8'));
    assert.deepEqual(Object.keys(reg.pages).sort(), [
      'https://x/a',
      'https://x/b',
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
