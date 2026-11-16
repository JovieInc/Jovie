import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  adoptReuse,
  downloadCertifiedArtifact,
  lookupReuse,
  RECEIPTS_FILE,
  STAMP_FILE,
} from '../../golden-path-cert-reuse.mjs';
import {
  CERT_MAX_AGE_MS,
  CLOCK_INTERVAL_MS,
  certifiedArtifactName,
  certifiedStamp,
  decideCertReuse,
  producerFiles,
  REUSE_MAX_AGE_MS,
  reusedReceiptDocument,
  STAMP_SCHEMA,
  WORKFLOW_PATH,
} from '../golden-path-cert-reuse.mjs';
import { SURFACE_IDS } from '../prod-cert.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const repository = 'JovieInc/Jovie';
const served = 'a'.repeat(40);
const other = 'b'.repeat(40);
const digest = 'd'.repeat(64);
const nowMs = Date.parse('2026-11-14T12:00:00.000Z');
const hoursAgo = h => new Date(nowMs - h * 3_600_000).toISOString();

/** A certifying run's artifact, as lookup sees it. */
function candidate({
  runId = 500,
  sha = served,
  endedAt = hoursAgo(2),
  status = 'passed',
  stamp = {},
  document = {},
  run = {},
} = {}) {
  return {
    runId,
    runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
    artifactId: runId * 10,
    run: {
      path: WORKFLOW_PATH,
      head_branch: 'main',
      head_repository: { full_name: repository },
      ...run,
    },
    stamp: {
      schema: STAMP_SCHEMA,
      servedSha: sha,
      runId,
      producerDigest: digest,
      ...stamp,
    },
    document: {
      servedSha: sha,
      receipts: SURFACE_IDS.map(surface => ({
        surface,
        status,
        sha,
        endedAt,
        runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
      })),
      ...document,
    },
  };
}
const decide = (candidates, extra = {}) =>
  decideCertReuse({
    servedSha: served,
    repository,
    producerDigest: digest,
    nowMs,
    candidates,
    ...extra,
  });

describe('certify each served build once (JOV-12639)', () => {
  it('reuses a fresh certified receipt for the same served SHA', () => {
    const decision = decide([candidate()]);
    expect(decision).toMatchObject({ reuse: true });
    expect(decision.source?.runId).toBe(500);
    expect(decision.source?.certifiedAt).toBe(hoursAgo(2));
  });

  it('runs when the only receipt is for another SHA', () => {
    expect(decide([candidate({ sha: other })]).reuse).toBe(false);
    // The stamp and the receipts must both name the served SHA.
    expect(
      decide([candidate({ stamp: { servedSha: other } })]).rejected[0].why
    ).toBe('stamp is for another SHA');
    expect(decide([candidate({ document: { servedSha: other } })]).reuse).toBe(
      false
    );
  });

  it('runs when the receipt is older than the reuse window', () => {
    const stale = decide([candidate({ endedAt: hoursAgo(11.1) })]);
    expect(stale).toMatchObject({ reuse: false });
    expect(stale.rejected[0].why).toBe('receipt is stale');
    // The 12 h clock still refreshes inside the 24 h verdict window.
    expect(REUSE_MAX_AGE_MS + CLOCK_INTERVAL_MS).toBeLessThan(CERT_MAX_AGE_MS);
    expect(decide([candidate({ endedAt: hoursAgo(10.9) })]).reuse).toBe(true);
  });

  it('runs when forced, even with a fresh certified receipt', () => {
    expect(decide([candidate()], { force: true })).toMatchObject({
      reuse: false,
      reason: 'forced',
    });
  });

  it('never reuses a receipt that is not fully certified or not honest', () => {
    const cases = [
      candidate({ status: 'failed' }),
      candidate({ status: 'blocked' }),
      candidate({ stamp: { producerDigest: 'e'.repeat(64) } }),
      candidate({ stamp: { runId: 499 } }),
      candidate({ stamp: { schema: 'other' } }),
      candidate({ run: { head_branch: 'feature' } }),
      candidate({ run: { path: '.github/workflows/ci.yml' } }),
      candidate({ endedAt: 'not a time' }),
      candidate({ endedAt: new Date(nowMs + 3_600_000).toISOString() }),
      candidate({ document: { reuse: { reused: true } } }),
      candidate({ document: { receipts: [] } }),
    ];
    for (const c of cases) expect(decide([c]).reuse).toBe(false);
    const short = candidate();
    short.document.receipts = short.document.receipts.slice(1);
    expect(decide([short]).reuse).toBe(false);
    expect(decide([candidate()], { servedSha: 'abc1234' }).reuse).toBe(false);
  });

  it('takes the newest valid run and reports the ones it passed over', () => {
    const decision = decide([
      candidate({ runId: 400 }),
      candidate({ runId: 600, status: 'failed' }),
    ]);
    expect(decision.source?.runId).toBe(400);
    expect(decision.rejected).toEqual([
      { runId: 600, why: 'not every surface passed on this SHA' },
    ]);
  });

  it('says a reused receipt was reused, and from which run', () => {
    const decision = decide([candidate()]);
    const doc = reusedReceiptDocument(decision, {
      runId: 900,
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/900',
      nowMs,
    });
    expect(doc.reuse).toMatchObject({
      reused: true,
      fromRunId: 500,
      fromRunUrl: 'https://github.com/JovieInc/Jovie/actions/runs/500',
      fromArtifactId: 5000,
      certifiedAt: hoursAgo(2),
      decidedByRunId: 900,
    });
    expect(doc.receipts).toEqual(candidate().document.receipts);
    expect(() =>
      reusedReceiptDocument(decide([]), { runId: 900, nowMs })
    ).toThrow();
  });

  it('stamps only a run where every surface passed on the expected SHA', () => {
    const { document } = candidate({ endedAt: hoursAgo(0) });
    const stamp = certifiedStamp(document, {
      expectedSha: served,
      runId: 500,
      producerDigest: digest,
      nowMs,
    });
    expect(stamp).toMatchObject({ schema: STAMP_SCHEMA, servedSha: served });
    const args = { runId: 500, producerDigest: digest, nowMs };
    expect(certifiedStamp(document, { ...args, expectedSha: other })).toBe(
      null
    );
    const failed = candidate({ status: 'failed', endedAt: hoursAgo(0) });
    expect(
      certifiedStamp(failed.document, { ...args, expectedSha: served })
    ).toBe(null);
    expect(certifiedArtifactName(served)).toBe(`prod-cert-certified-${served}`);
    expect(() => certifiedArtifactName('main')).toThrow();
  });

  it('binds reuse to the certification code that wrote the receipt', () => {
    const files = producerFiles(ROOT);
    for (const file of [
      'scripts/prod-cert.mjs',
      'scripts/lib/prod-cert.mjs',
      'scripts/lib/cert-bottleneck.mjs',
      'scripts/invariants/pen-golden-path.mjs',
      'docs/pen-stills/golden-path/manifest.json',
      WORKFLOW_PATH,
    ])
      expect(files).toContain(file);
  });
});

describe('receipt lookup', () => {
  const index = rows => ({ artifacts: rows });
  const row = (runId, extra = {}) => ({
    id: runId * 10,
    name: certifiedArtifactName(served),
    expired: false,
    size_in_bytes: 1024,
    created_at: hoursAgo(2),
    workflow_run: { id: runId },
    ...extra,
  });
  /** @param {any[]} rows @param {Record<number, any>} byRun */
  const fakes = (rows, byRun) => {
    const calls = [];
    return {
      calls,
      transport: {
        getJson: endpoint => {
          calls.push(endpoint);
          if (endpoint.includes('/actions/artifacts?name=')) return index(rows);
          const runId = Number(endpoint.split('/').at(-1));
          return { ...byRun[runId].run, html_url: byRun[runId].runUrl };
        },
      },
      download: (_repo, artifactId) => {
        const c = byRun[artifactId / 10];
        return { stamp: c.stamp, document: c.document };
      },
    };
  };
  const base = { repository, servedSha: served, runId: 900, nowMs, digest };

  it('finds the certified artifact for the served SHA by exact name', () => {
    const c = candidate();
    const { transport, download, calls } = fakes([row(500)], { 500: c });
    const decision = lookupReuse({
      ...base,
      force: false,
      transport,
      download,
    });
    expect(decision.reuse).toBe(true);
    expect(calls[0]).toBe(
      `repos/${repository}/actions/artifacts?name=${certifiedArtifactName(served)}&per_page=30`
    );
  });

  it('makes no GitHub call when forced, and skips its own and expired runs', () => {
    const forced = fakes([row(500)], { 500: candidate() });
    expect(lookupReuse({ ...base, force: true, ...forced }).reuse).toBe(false);
    expect(forced.calls).toEqual([]);
    const own = fakes(
      [
        row(900),
        row(500, { expired: true }),
        row(400, { created_at: hoursAgo(13) }),
      ],
      {}
    );
    expect(lookupReuse({ ...base, force: false, ...own })).toMatchObject({
      reuse: false,
      reason: 'no fresh certified receipt for the served SHA',
    });
    expect(own.calls).toHaveLength(1);
  });
});

describe('adopting the chosen receipt', () => {
  const row = (extra = {}) => ({
    id: 5000,
    name: certifiedArtifactName(served),
    expired: false,
    size_in_bytes: 1024,
    workflow_run: { id: 500 },
    ...extra,
  });
  const c = candidate();
  const deps = artifact => ({
    repository,
    servedSha: served,
    nowMs,
    digest,
    sourceRunId: 500,
    artifactId: 5000,
    transport: {
      getJson: endpoint =>
        endpoint.endsWith('/artifacts/5000')
          ? artifact
          : { ...c.run, html_url: c.runUrl },
    },
    download: () => ({ stamp: c.stamp, document: c.document }),
  });

  it('re-judges the one artifact lookup chose', () => {
    expect(adoptReuse(deps(row())).reuse).toBe(true);
    expect(adoptReuse(deps(row({ workflow_run: { id: 501 } }))).reuse).toBe(
      false
    );
    expect(adoptReuse(deps(row({ expired: true }))).reuse).toBe(false);
    expect(
      adoptReuse({ ...deps(row()), nowMs: nowMs + 10 * 3_600_000 }).reason
    ).toBe('no fresh certified receipt for the served SHA');
  });

  it('accepts an artifact holding only the receipts and the stamp', () => {
    const execute = members => (command, args) => {
      if (command === 'unzip' && args[0] === '-Z1')
        return { status: 0, stdout: `${members.join('\n')}\n` };
      if (command === 'unzip')
        return {
          status: 0,
          stdout: args[2] === STAMP_FILE ? '{"s":1}' : '{"r":1}',
        };
      return { status: 0 };
    };
    expect(
      downloadCertifiedArtifact(repository, 1, {
        execute: /** @type {any} */ (execute([STAMP_FILE, RECEIPTS_FILE])),
      })
    ).toEqual({ document: { r: 1 }, stamp: { s: 1 } });
    expect(() =>
      downloadCertifiedArtifact(repository, 1, {
        execute: /** @type {any} */ (
          execute([RECEIPTS_FILE, 'extra.json', STAMP_FILE])
        ),
      })
    ).toThrow('only the receipts and the stamp');
  });
});

describe('postdeploy-probes workflow wiring (JOV-12639)', () => {
  const workflow = /** @type {any} */ (
    load(readFileSync(resolve(ROOT, WORKFLOW_PATH), 'utf8'))
  );
  const jobs = workflow.jobs;
  const step = (job, id) => jobs[job].steps.find(s => s.id === id);

  it('offers a force input that defaults to false', () => {
    expect(workflow.on.workflow_dispatch.inputs.force).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(step('resolve-target', 'cert-reuse').env.FORCE_RECERTIFY).toContain(
      'client_payload.force'
    );
  });

  it('decides reuse in the resolver and never fails it on a lookup error', () => {
    expect(jobs['resolve-target'].outputs.cert_reused).toBe(
      "${{ steps.cert-reuse.outputs.reuse == 'true' }}"
    );
    // A resolver failure pages production; a lookup failure must not.
    expect(step('resolve-target', 'cert-reuse').run).toMatch(
      /--github-output "\$GITHUB_OUTPUT" \|\|\n\s+echo "::warning::/u
    );
  });

  it('uploads the reused receipt from its own job, marked as reused', () => {
    const job = jobs['golden-path-cert-reused'];
    expect(job.if).toContain(
      "needs.resolve-target.outputs.cert_reused == 'true'"
    );
    expect(job.permissions).toEqual({ contents: 'read', actions: 'read' });
    const run = job.steps.map(s => s.run ?? '').join('\n');
    expect(run).toContain('golden-path-cert-reuse.mjs adopt');
    expect(run).not.toContain('--post');
    const upload = job.steps.find(s =>
      String(s.uses).startsWith('actions/upload-artifact@')
    );
    expect(upload.with.name).toBe('prod-cert-reused-${{ github.run_id }}');
  });

  it('skips certification on reuse but keeps auth smoke for probes', () => {
    expect(jobs['golden-path-cert'].if).toContain(
      "needs.resolve-target.outputs.cert_reused != 'true'"
    );
    expect(jobs['auth-smoke'].if).toContain(
      "(needs.resolve-target.outputs.should_probe == 'true' || needs.resolve-target.outputs.cert_reused != 'true')"
    );
  });

  it('stamps only after a successful certify step', () => {
    expect(step('golden-path-cert', 'stamp').if).toBe(
      "${{ steps.certify.outcome == 'success' }}"
    );
    const upload = jobs['golden-path-cert'].steps.find(
      s => s.name === 'Upload the certified receipts for reuse'
    );
    expect(upload.with.name).toBe(
      'prod-cert-certified-${{ needs.resolve-target.outputs.commit_sha }}'
    );
  });

  it('keys the Pen export cache by content, saved under the export step key', () => {
    const steps = jobs['golden-path-cert'].steps;
    const restore = steps.find(s =>
      String(s.uses).endsWith('actions-cache/restore')
    );
    const save = steps.find(s => String(s.uses).endsWith('actions-cache/save'));
    expect(restore.with.key).toBe('${{ steps.pen-source.outputs.cache_key }}');
    expect(save.with.key).toBe('${{ steps.pen-export.outputs.cache_key }}');
    expect(save.if).toContain(
      "steps.pen-export.outputs.export_cacheable == 'true'"
    );
  });
});
