import { describe, expect, it, vi } from 'vitest';

const calls = [];
const now = Date.now();
const iso = minutesAgo => new Date(now - minutesAgo * 60_000).toISOString();

// Mimics the real gh CLI: `--paginate --slurp` with `--jq` is rejected before
// any request, and a streaming `--jq` filter prints NDJSON.
function fakeGh(args) {
  calls.push(args);
  if (args.includes('--slurp') && args.includes('--jq'))
    throw new Error('the `--slurp` option is not supported with `--jq`');
  if (args[0] === 'pr' && args[1] === 'list') {
    const search = args[args.indexOf('--search') + 1];
    if (!search.endsWith(new Date(now).toISOString().slice(0, 10))) return '[]';
    return JSON.stringify([
      {
        number: 7,
        title: 't',
        headRefName: 'codex/jov-7',
        headRefOid: 'h7',
        createdAt: iso(90),
        mergedAt: iso(30),
        mergeCommit: { oid: 'm7' },
      },
    ]);
  }
  const endpoint = args[1] ?? '';
  if (endpoint.endsWith('/issues/7/timeline'))
    return `${JSON.stringify({ type: 'added_to_merge_queue', at: iso(50) })}\n${JSON.stringify({ type: 'merged', at: iso(30) })}\n`;
  if (endpoint.includes('production-controller.yml/runs'))
    return `${JSON.stringify({ id: 11, head_sha: 'm7' })}\n`;
  if (endpoint.includes('/actions/runs/11/jobs'))
    return JSON.stringify([
      {
        jobs: [
          {
            name: 'Production Verified',
            conclusion: 'success',
            completed_at: iso(10),
          },
        ],
      },
    ]);
  if (endpoint.includes('/pulls/7/files'))
    return JSON.stringify([
      [{ filename: 'a.ts', status: 'modified', previous_filename: null }],
    ]);
  return '[]';
}

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal()),
  execFileSync: (_file, args) => fakeGh(args),
}));

const { buildReport, collectRaw, parseGhOutput } = await import(
  '../../shipping-slo-report.mjs'
);

describe('shipping SLO collector against real gh output shapes', () => {
  it('parses NDJSON, never combines --slurp with --jq, and slices merged-PR search', () => {
    const raw = collectRaw({ workflows: ['ci.yml'], days: 12 });
    expect(calls.some(a => a.includes('--slurp') && a.includes('--jq'))).toBe(
      false
    );
    const searches = calls
      .filter(a => a[0] === 'pr' && a[1] === 'list')
      .map(a => a[a.indexOf('--search') + 1]);
    expect(searches.length).toBeGreaterThanOrEqual(3);
    expect(
      searches.every(q => /^merged:\d{4}-\d\d-\d\d\.\.\d{4}-\d\d-\d\d$/.test(q))
    ).toBe(true);
    expect(raw.mergedPrs.map(p => p.number)).toEqual([7]);
    expect(raw.timelines[7].map(e => e.type)).toEqual([
      'added_to_merge_queue',
      'merged',
    ]);
    expect(raw.productionVerifications).toEqual([
      { sha: 'm7', verifiedAt: iso(10) },
    ]);
    expect(raw.mergedPrs[0].files).toEqual([
      { filename: 'a.ts', status: 'modified', previousFilename: null },
    ]);

    const report = buildReport(raw, { schemaVersion: 1, metrics: {} }, { now });
    expect(report.metrics.mergeQueue.wait.n).toBe(1);
    expect(report.metrics.productionLag.lag.n).toBe(1);
  });

  it('parses single documents, NDJSON and empty output', () => {
    expect(parseGhOutput('[1,2]')).toEqual([1, 2]);
    expect(parseGhOutput('{"a":1}\n{"a":2}\n')).toEqual([{ a: 1 }, { a: 2 }]);
    expect(parseGhOutput('  ')).toBeNull();
  });
});
