import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('map/crawl require a URL and the research gateway', () => {
  assert.match(run(['map']).stderr, /missing/);
  const r = run(['crawl', 'https://x'], {
    PATH: process.env.PATH,
    JOVIE_RESEARCH_BIN: '/nonexistent/jovie-research',
  });
  assert.match(r.stderr, /research gateway not found/);
  assert.notEqual(r.status, 0);
});

function fakeGateway(dir, reply, code = 0) {
  const bin = join(dir, 'jovie-research');
  const log = join(dir, 'calls.log');
  writeFileSync(
    bin,
    `#!/bin/sh\necho "$*" >> '${log}'\nprintf '%s' '${reply}'\nexit ${code}\n`,
    { mode: 0o755 }
  );
  return { bin, log };
}

test('map goes through the gateway and books one credit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-gw-'));
  try {
    const { bin, log } = fakeGateway(
      dir,
      JSON.stringify({ success: true, links: ['https://x/a', 'https://x/b'] })
    );
    const r = run(['map', 'https://x.example/'], {
      PATH: process.env.PATH,
      JOVIE_RESEARCH_BIN: bin,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /"mapped": 2/);
    rmSync(join(dirname(SCRIPT), '.cache/firecrawl-registry/x.example.json'), {
      force: true,
    });
    const call = readFileSync(log, 'utf8');
    assert.match(
      call,
      /^call firecrawl POST \/v1\/map --units 1 --caller firecrawl-crawl --body /
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('map truncates a large delta to --limit without SIGPIPE, in v1 body shape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-big-'));
  try {
    const links = Array.from(
      { length: 5000 },
      (_, i) => `https://big.example/p${i}`
    );
    const { bin, log } = fakeGateway(
      dir,
      JSON.stringify({ success: true, links })
    );
    const r = run(
      ['map', 'https://big.example/', '--limit', '3', '--sitemap', 'skip'],
      {
        PATH: process.env.PATH,
        JOVIE_RESEARCH_BIN: bin,
      }
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      r.stdout
        .trim()
        .split('\n')
        .filter(l => l.startsWith('https://')).length,
      3
    );
    const call = readFileSync(log, 'utf8');
    assert.match(call, /"ignoreSitemap":true/);
    assert.doesNotMatch(call, /"sitemap"/);
  } finally {
    rmSync(
      join(dirname(SCRIPT), '.cache/firecrawl-registry/big.example.json'),
      { force: true }
    );
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a capped gateway stops the crawl with a clear reason', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-cap-'));
  try {
    const { bin } = fakeGateway(dir, '', 75);
    const r = run(['map', 'https://x.example/'], {
      PATH: process.env.PATH,
      JOVIE_RESEARCH_BIN: bin,
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /credit cap reached or no credential/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
