#!/usr/bin/env node
import assert from 'node:assert/strict';
/**
 * Offline tests for scripts/catalog-duplicate-report.mjs.
 *
 * Run: node --test scripts/catalog-duplicate-report.test.mjs
 *
 * No database, no network, no repository data: every fixture is written to a
 * temp file by the test itself and deleted afterwards.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { parseArgs, validateExportRows } from './catalog-duplicate-report.mjs';

const SCRIPT = resolve(import.meta.dirname, 'catalog-duplicate-report.mjs');

const VALID_EXPORT = {
  releases: [
    {
      id: 'rel-a',
      profileId: 'profile-a',
      slug: 'night-drive',
      title: 'Night Drive',
      releaseDate: '2026-05-01',
      upc: null,
      deletedAt: null,
      providers: [
        { key: 'spotify', url: 'https://open.spotify.com/album/dup999' },
      ],
      tracks: [],
      dependents: { smart_links: 1 },
    },
    {
      id: 'rel-b',
      profileId: 'profile-a',
      slug: 'night-drive-2',
      title: 'Night Drive',
      releaseDate: '2026-05-01',
      upc: null,
      deletedAt: null,
      providers: [
        { key: 'spotify', url: 'https://open.spotify.com/album/dup999' },
      ],
      tracks: [],
      dependents: {},
    },
  ],
};

function withTempExport(payload, run) {
  const dir = mkdtempSync(join(tmpdir(), 'dup-report-test-'));
  const path = join(dir, 'export.json');
  writeFileSync(path, JSON.stringify(payload));
  try {
    return run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function rowOverrides(overrides) {
  return {
    ...VALID_EXPORT.releases[0],
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('accepts one export path plus --pretty', () => {
    assert.deepEqual(parseArgs(['export.json', '--pretty']), {
      path: 'export.json',
      pretty: true,
    });
    assert.deepEqual(parseArgs(['export.json']), {
      path: 'export.json',
      pretty: false,
    });
  });

  it('rejects unknown flags such as --apply instead of ignoring them', () => {
    assert.throws(() => parseArgs(['--apply', 'export.json']), /--apply/);
    assert.throws(() => parseArgs(['--write', 'export.json']), /--write/);
  });

  it('rejects a missing or duplicated export path', () => {
    assert.throws(() => parseArgs([]), /exactly one export path/);
    assert.throws(
      () => parseArgs(['a.json', 'b.json']),
      /exactly one export path/
    );
  });
});

describe('validateExportRows', () => {
  it('accepts a well-formed export', () => {
    assert.deepEqual(
      validateExportRows(VALID_EXPORT.releases),
      VALID_EXPORT.releases
    );
  });

  it('rejects a missing profileId with a row-indexed error', () => {
    const { profileId, ...noProfile } = rowOverrides({});
    assert.throws(
      () => validateExportRows([VALID_EXPORT.releases[0], noProfile]),
      /row 1.*profileId/i
    );
  });

  it('rejects a blank profileId rather than grouping under an undefined bucket', () => {
    const blankProfile = rowOverrides({ profileId: '   ' });
    assert.throws(
      () => validateExportRows([blankProfile]),
      /row 0.*profileId/i
    );
  });

  it('rejects rows missing nonempty release ids and other required strings', () => {
    assert.throws(
      () => validateExportRows([{ ...VALID_EXPORT.releases[0], id: '' }]),
      /row 0.*\bid\b/i
    );
    const { slug, ...noSlug } = rowOverrides({});
    assert.throws(() => validateExportRows([noSlug]), /row 0.*slug/i);
    assert.throws(
      () =>
        validateExportRows([
          { ...VALID_EXPORT.releases[0], releaseDate: 20260501 },
        ]),
      /row 0.*releaseDate/i
    );
  });

  it('rejects malformed provider links, tracks and counts', () => {
    assert.throws(
      () =>
        validateExportRows([
          { ...VALID_EXPORT.releases[0], providers: 'spotify' },
        ]),
      /row 0.*providers/i
    );
    assert.throws(
      () =>
        validateExportRows([
          { ...VALID_EXPORT.releases[0], providers: [{ url: 'https://x' }] },
        ]),
      /row 0.*providers\[0\]\.key/i
    );
    assert.throws(
      () =>
        validateExportRows([
          {
            ...VALID_EXPORT.releases[0],
            tracks: [{ id: '', title: 'X', isrc: null }],
          },
        ]),
      /row 0.*tracks\[0\]\.id/i
    );
    assert.throws(
      () =>
        validateExportRows([
          { ...VALID_EXPORT.releases[0], dependents: { smart_links: -1 } },
        ]),
      /row 0.*smart_links/i
    );
    assert.throws(
      () =>
        validateExportRows([
          { ...VALID_EXPORT.releases[0], dependents: { smart_links: 'many' } },
        ]),
      /row 0.*smart_links/i
    );
  });

  it('rejects a non-array releases value', () => {
    assert.throws(
      () => validateExportRows({ releases: 'everything' }),
      /expected \{"releases"/i
    );
  });
});

describe('catalog-duplicate-report CLI', () => {
  it('exits 0 and prints the report for a valid export', () => {
    withTempExport(VALID_EXPORT, path => {
      const stdout = execFileSync(
        process.execPath,
        [SCRIPT, path, '--pretty'],
        {
          encoding: 'utf8',
        }
      );
      const report = JSON.parse(stdout);
      assert.equal(report.releaseCount, 2);
      assert.equal(report.groups.length, 1);
      assert.equal(report.groups[0].kind, 'provider-album-id');
      assert.equal(report.groups[0].disposition, 'candidate');
    });
  });

  it('exits nonzero with a row-indexed error for a row missing profileId', () => {
    const { profileId, ...noProfile } = rowOverrides({});
    withTempExport(
      { releases: [VALID_EXPORT.releases[0], noProfile] },
      path => {
        let failed = false;
        try {
          execFileSync(process.execPath, [SCRIPT, path], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (error) {
          failed = true;
          assert.ok(error.status !== 0);
          assert.match(error.stderr, /row 1.*profileId/i);
        }
        assert.ok(failed, 'expected the CLI to exit nonzero');
      }
    );
  });

  it('exits nonzero for a malformed row and never prints a report', () => {
    withTempExport(
      { releases: [{ ...VALID_EXPORT.releases[0], providers: 'nope' }] },
      path => {
        let failed = false;
        try {
          execFileSync(process.execPath, [SCRIPT, path], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (error) {
          failed = true;
          assert.ok(error.status !== 0);
          assert.match(error.stderr, /providers must be an array/i);
          assert.ok(!error.stdout || error.stdout.trim() === '');
        }
        assert.ok(failed, 'expected the CLI to exit nonzero');
      }
    );
  });

  it('exits nonzero for an unknown flag such as --apply', () => {
    withTempExport(VALID_EXPORT, path => {
      let failed = false;
      try {
        execFileSync(process.execPath, [SCRIPT, '--apply', path], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (error) {
        failed = true;
        assert.ok(error.status !== 0);
        assert.match(error.stderr, /--apply/);
      }
      assert.ok(failed, 'expected the CLI to exit nonzero');
    });
  });
});
