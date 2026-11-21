import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildHealthDigest,
  CLAIMS_INDEX_SLUG,
  classifyWriteError,
  collectHealthDigest,
  compoundHealthDigest,
  compoundIdMarker,
  createGbrainWriter,
  DIGEST_SCHEMA,
  extractDurableClaims,
  LATEST_SLUG,
  runCompounding,
  withCompoundId,
} from './index.mjs';

const generatedAt = '2026-11-21T12:00:00.000Z';

function check(name, ok, detail = 'ok', required = true) {
  return { name, ok, detail, durationMs: 1, required };
}

function healthyDigest() {
  return buildHealthDigest({
    generatedAt,
    checks: [
      check('http-health', true, 'status=ok'),
      check('doctor', true, 'status=ok', false),
      check('source-freshness', true, 'all indexed sources are fresh'),
      check(
        'serve-processes',
        true,
        'exactly one gbrain serve process is running'
      ),
    ],
  });
}

test('buildHealthDigest classifies healthy / degraded / down', () => {
  assert.equal(
    buildHealthDigest({
      generatedAt,
      checks: [check('http-health', true)],
    }).status,
    'healthy'
  );
  assert.equal(
    buildHealthDigest({
      generatedAt,
      checks: [check('http-health', true), check('serve-processes', false)],
    }).status,
    'degraded'
  );
  assert.equal(buildHealthDigest({ generatedAt, checks: [] }).status, 'down');
  assert.equal(
    buildHealthDigest({
      generatedAt,
      checks: [check('http-health', false), check('serve-processes', false)],
    }).status,
    'down'
  );
});

test('collectHealthDigest keeps advisory doctor failures non-fatal', () => {
  const exec = /** @type {import('node:child_process').execFileSync} */ (
    /** @type {unknown} */ (
      (file, args) => {
        if (file === 'curl') return JSON.stringify({ status: 'ok' });
        if (file === 'pgrep') return '42 gbrain serve --http';
        if (args[0] === 'doctor') throw new Error('114 migrations pending');
        if (args[0] === 'sources') {
          return JSON.stringify({
            sources: [{ id: 'code', page_count: 1, last_sync_at: generatedAt }],
          });
        }
        throw new Error(`unexpected ${file} ${args.join(' ')}`);
      }
    )
  );

  const digest = collectHealthDigest({
    exec,
    now: new Date(generatedAt),
  });
  assert.equal(digest.schema, DIGEST_SCHEMA);
  assert.equal(digest.status, 'healthy');
  assert.equal(digest.checks[1].name, 'doctor');
  assert.equal(digest.checks[1].ok, false);
  assert.equal(digest.checks[1].required, false);
});

test('extractDurableClaims builds stable daily claim slugs', () => {
  const claims = extractDurableClaims(healthyDigest());
  assert.ok(claims.length >= 5);
  assert.equal(claims[0].id, 'gbrain-health-status-2026-11-21');
  assert.equal(claims[0].slug, 'ops/gbrain-health/claims/2026-11-21/status');
  assert.match(claims[0].fact, /healthy/);
  assert.ok(claims.every(c => c.schema === 'jovie.gbrain-durable-claim/v1'));
});

test('compoundHealthDigest writes latest + claims with read-back', () => {
  /** @type {Map<string, string>} */
  const store = new Map();
  const writer = createGbrainWriter({
    bin: 'gbrain',
    execute: (file, args, opts) => {
      assert.equal(file, 'gbrain');
      if (args[0] === '--help') return 'gbrain help';
      if (args[0] === 'put') {
        store.set(args[1], String(opts?.input || ''));
        return '';
      }
      if (args[0] === 'get') {
        const body = store.get(args[1]);
        if (!body) {
          throw Object.assign(new Error('not found'), { code: 'ENOENT' });
        }
        return body;
      }
      throw new Error(`unexpected ${args.join(' ')}`);
    },
  });

  const result = compoundHealthDigest({
    digest: healthyDigest(),
    writer,
  });
  assert.equal(result.status, 'compounded');
  assert.equal(result.reason, null);
  assert.ok(store.has(LATEST_SLUG));
  assert.ok(store.has(CLAIMS_INDEX_SLUG));
  assert.ok(store.get(LATEST_SLUG)?.includes('jovie.gbrain-health-digest/v1'));
  assert.equal(result.writes.filter(w => w.ok).length, result.writes.length);
});

test('compoundHealthDigest degrades to needs-probe when gbrain is unavailable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gbrain-compound-'));
  try {
    const writer = createGbrainWriter({
      bin: 'gbrain',
      execute: () => {
        throw Object.assign(new Error('spawn gbrain ENOENT'), {
          code: 'ENOENT',
        });
      },
    });
    const result = compoundHealthDigest({
      digest: healthyDigest(),
      writer,
      bufferDir: dir,
    });
    assert.equal(result.status, 'needs-probe');
    assert.equal(result.reason, 'gbrain-unavailable');
    assert.ok(result.buffered.length > 0);
    assert.ok(result.buffered.every(path => path.startsWith(dir)));
    const latest = result.buffered.find(p =>
      p.includes('ops__gbrain-health__latest')
    );
    assert.ok(latest);
    assert.match(readFileSync(latest, 'utf8'), /GBrain health summary/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('classifyWriteError maps missing binary to gbrain-unavailable', () => {
  const err = Object.assign(new Error('spawn gbrain ENOENT'), {
    code: 'ENOENT',
  });
  assert.equal(classifyWriteError(err), 'gbrain-unavailable');
  assert.equal(
    classifyWriteError(new Error('connect ECONNREFUSED 127.0.0.1:7801')),
    'gbrain-unavailable'
  );
});

test('classifyWriteError does not treat free-text not found as unavailable', () => {
  assert.notEqual(
    classifyWriteError(new Error('page not found: ops/gbrain-health/latest')),
    'gbrain-unavailable'
  );
  assert.match(
    classifyWriteError(new Error('page not found: ops/gbrain-health/latest')),
    /not found/i
  );
});

test('putWithReadback rejects stale pages that only share static tails', () => {
  const stale = withCompoundId(
    '---\ntitle: old\n---\n\n# old\n\nNot Linear work acceptance, not an authority change, not a shipping receipt.\n'
  );
  const writer = createGbrainWriter({
    bin: 'gbrain',
    execute: (file, args) => {
      assert.equal(file, 'gbrain');
      if (args[0] === '--help') return 'gbrain help';
      if (args[0] === 'put') return ''; // pretend put succeeded / was dropped
      if (args[0] === 'get') return stale; // stale prior page
      throw new Error(`unexpected ${args.join(' ')}`);
    },
  });
  const result = compoundHealthDigest({
    digest: healthyDigest(),
    writer,
  });
  assert.equal(result.status, 'degraded');
  assert.ok(
    result.writes.every(
      w =>
        !w.ok &&
        'reason' in w &&
        w.reason === 'gbrain read-back missing compound_id'
    )
  );
  const stamped = result.pages[0].body;
  assert.ok(compoundIdMarker(stamped));
  assert.notEqual(compoundIdMarker(stamped), compoundIdMarker(stale));
});

test('runCompounding --dry-run exits 0 without writing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gbrain-compound-dry-'));
  try {
    const digestPath = join(dir, 'digest.json');
    writeFileSync(digestPath, JSON.stringify(healthyDigest()));
    let putCalls = 0;
    const writer = createGbrainWriter({
      execute: (_file, args) => {
        if (args[0] === 'put') putCalls += 1;
        return '';
      },
    });
    const { exitCode, result, stdout } = runCompounding(
      ['--digest-file', digestPath, '--dry-run'],
      { writer }
    );
    assert.equal(exitCode, 0);
    assert.equal(result.status, 'dry-run');
    assert.equal(putCalls, 0);
    assert.match(stdout, /"status":"dry-run"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runCompounding fixture path returns needs-probe exit 0 without gbrain', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gbrain-compound-run-'));
  try {
    const digestPath = join(dir, 'digest.json');
    writeFileSync(digestPath, JSON.stringify(healthyDigest()));
    const writer = createGbrainWriter({
      execute: () => {
        throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      },
    });
    const { exitCode, result } = runCompounding(
      ['--digest-file', digestPath, '--buffer-dir', dir],
      { writer }
    );
    assert.equal(exitCode, 0);
    assert.equal(result.status, 'needs-probe');
    assert.equal(result.reason, 'gbrain-unavailable');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
