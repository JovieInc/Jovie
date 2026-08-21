import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  KEYWORD_TIMEOUT_MS,
  keywordSearchArgs,
  parsePage,
  parseSearchSlugs,
  SEMANTIC_TIMEOUT_MS,
  semanticSearchArgs,
} from '../gbrain-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const clientHref = pathToFileURL(join(here, '../gbrain-client.mjs')).href;

function installFakeGbrain(script) {
  const dir = mkdtempSync(join(tmpdir(), 'gbrain-client-'));
  const bin = join(dir, 'gbrain');
  writeFileSync(bin, `#!/usr/bin/env bash\n${script}\n`);
  chmodSync(bin, 0o755);
  return { dir, bin };
}

function runSearchPages(bin, query) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { searchPages } from ${JSON.stringify(clientHref)};
const pages = await searchPages(${JSON.stringify(query)}, 1);
process.stdout.write(JSON.stringify(pages));`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, JOVIE_GBRAIN_BIN: bin },
    }
  );
}

describe('gbrain client keyword-first lookup', () => {
  it('sends issue terms to gbrain search, not query', () => {
    assert.deepEqual(
      keywordSearchArgs(
        'canonize scene-first color harmony generated brand imagery',
        1
      ),
      [
        'search',
        'canonize scene-first color harmony generated brand imagery',
        '--limit',
        '1',
      ]
    );
    assert.equal(semanticSearchArgs('existing agent work', 1)[0], 'query');
    assert.equal(KEYWORD_TIMEOUT_MS, 10_000);
    assert.equal(SEMANTIC_TIMEOUT_MS, 10_000);
  });

  it('parses revision-bound pages from the installed CLI contract', () => {
    const raw =
      "---\ntype: coordination\nupdated_at: '2026-08-13T00:00:00Z'\n---\n\n# Current ownership\n";
    const page = parsePage('agent-org-chart', raw);
    assert.equal(page?.revision, '2026-08-13T00:00:00Z');
    assert.deepEqual(parseSearchSlugs('[0.99] notes/color-harmony -- first'), [
      'notes/color-harmony',
    ]);
  });

  it('does not invoke semantic query after keyword search binds a page', () => {
    const calls = join(
      mkdtempSync(join(tmpdir(), 'gbrain-calls-')),
      'calls.log'
    );
    const { bin } = installFakeGbrain(`
echo "$*" >> "${calls}"
if [ "$1" = "search" ]; then
  echo "[0.99] notes/color-harmony -- founder decision"
  exit 0
fi
if [ "$1" = "query" ]; then
  echo "canceling statement due to statement timeout" >&2
  exit 1
fi
if [ "$1" = "get" ]; then
  printf '%s\\n' "---" "updated_at: '2026-08-21T00:00:00Z'" "---" "" "# Decision"
  exit 0
fi
exit 1
`);
    const result = runSearchPages(
      bin,
      'canonize scene-first color harmony generated brand imagery'
    );
    assert.equal(result.status, 0, result.stderr);
    const pages = JSON.parse(result.stdout);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].slug, 'notes/color-harmony');
    assert.equal(pages[0].revision, '2026-08-21T00:00:00Z');
    const logged = readFileSync(calls, 'utf8');
    assert.match(logged, /^search /m);
    assert.doesNotMatch(logged, /^query /m);
  });

  it('falls back to a bounded semantic query only after keyword cannot bind', () => {
    const calls = join(
      mkdtempSync(join(tmpdir(), 'gbrain-fallback-')),
      'calls.log'
    );
    const { bin } = installFakeGbrain(`
echo "$*" >> "${calls}"
if [ "$1" = "search" ]; then
  exit 0
fi
if [ "$1" = "query" ]; then
  echo "[0.91] notes/semantic-hit -- fallback"
  exit 0
fi
if [ "$1" = "get" ]; then
  printf '%s\\n' "---" "updated_at: '2026-08-21T00:00:00Z'" "---" "" "# Fallback"
  exit 0
fi
exit 1
`);
    const result = runSearchPages(bin, 'no keyword hit');
    assert.equal(result.status, 0, result.stderr);
    const pages = JSON.parse(result.stdout);
    assert.equal(pages[0].slug, 'notes/semantic-hit');
    const logged = readFileSync(calls, 'utf8');
    assert.match(logged, /^search /m);
    assert.match(logged, /^query /m);
  });
});
