import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { main, sign } from './import-github-audit.mjs';

test('sums attributed and unattributed counts from each github-audit page', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gh-audit-import-'));
  const file = join(dir, 'export.json');
  writeFileSync(
    file,
    JSON.stringify(Array.from({ length: 2001 }, (_, index) => ({ index })))
  );
  const previousFetch = globalThis.fetch;
  const previousSecret = process.env.FLEET_AUDIT_INGEST_SECRET;
  const previousUrl = process.env.FLEET_AUDIT_URL;
  const previousLog = console.log;
  /** @type {string[]} */
  const logs = [];
  /** @type {string[]} */
  const urls = [];
  process.env.FLEET_AUDIT_INGEST_SECRET = 'test-ingest-secret';
  process.env.FLEET_AUDIT_URL = 'https://audit.example.test';
  console.log = message => {
    logs.push(String(message));
  };
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(init?.method, 'POST');
    assert.equal(
      new Headers(init?.headers).get('x-fleet-audit-signature'),
      sign(String(init?.body), 'test-ingest-secret')
    );
    return Response.json(
      urls.length === 1
        ? { attributed: 2, unattributed: 1 }
        : { attributed: 4, unattributed: 3 }
    );
  };
  try {
    assert.equal(await main([file]), 0);
    assert.deepEqual(urls, [
      'https://audit.example.test/v1/github-audit',
      'https://audit.example.test/v1/github-audit',
    ]);
    assert.deepEqual(JSON.parse(logs.at(-1) ?? '{}'), {
      rows: 2001,
      attributed: 6,
      unattributed: 4,
    });
  } finally {
    globalThis.fetch = previousFetch;
    console.log = previousLog;
    if (previousSecret === undefined) {
      delete process.env.FLEET_AUDIT_INGEST_SECRET;
    } else {
      process.env.FLEET_AUDIT_INGEST_SECRET = previousSecret;
    }
    if (previousUrl === undefined) {
      delete process.env.FLEET_AUDIT_URL;
    } else {
      process.env.FLEET_AUDIT_URL = previousUrl;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
