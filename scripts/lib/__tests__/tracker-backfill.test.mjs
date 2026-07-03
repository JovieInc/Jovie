import { describe, expect, it, vi } from 'vitest';
import {
  BACKFILL_LABELS,
  backfillMarker,
  buildBackfillBody,
  ensureLabels,
  extractMigratedIds,
  fetchMigratedIds,
  labelsFor,
  mapPriority,
  mapState,
  normalizeLinearIssue,
  runBackfill,
} from '../tracker-backfill.mjs';

describe('mapPriority', () => {
  it('maps Linear priority ints to P0–P4 (urgent = P0)', () => {
    expect(mapPriority(1)).toBe('P0');
    expect(mapPriority(2)).toBe('P1');
    expect(mapPriority(3)).toBe('P2');
    expect(mapPriority(4)).toBe('P3');
    expect(mapPriority(0)).toBe('P4');
  });
  it('defaults unknown/missing priority to P4', () => {
    expect(mapPriority(undefined)).toBe('P4');
    expect(mapPriority(99)).toBe('P4');
  });
});

describe('mapState', () => {
  it('maps Linear state types to status:* labels', () => {
    expect(mapState('triage')).toBe('status:triage');
    expect(mapState('backlog')).toBe('status:backlog');
    expect(mapState('unstarted')).toBe('status:todo');
    expect(mapState('started')).toBe('status:in-progress');
    expect(mapState('completed')).toBe('status:done');
    expect(mapState('canceled')).toBe('status:canceled');
  });
  it('defaults unknown state to status:backlog', () => {
    expect(mapState('weird')).toBe('status:backlog');
    expect(mapState(undefined)).toBe('status:backlog');
  });
});

describe('labelsFor', () => {
  it('returns [status, priority]', () => {
    expect(labelsFor({ state: { type: 'started' }, priority: 1 })).toEqual([
      'status:in-progress',
      'P0',
    ]);
  });
  it('every label it can emit is in BACKFILL_LABELS', () => {
    const emitted = labelsFor({ state: { type: 'triage' }, priority: 2 });
    for (const label of emitted) expect(BACKFILL_LABELS).toContain(label);
  });
});

describe('buildBackfillBody', () => {
  const issue = {
    identifier: 'JOV-1234',
    title: 'Fix the thing',
    description: 'Steps to repro',
    url: 'https://linear.app/jovie/issue/JOV-1234',
    priorityLabel: 'Urgent',
    state: { name: 'In Progress', type: 'started' },
  };

  it('preserves the JOV identifier as a parseable marker', () => {
    const body = buildBackfillBody(issue);
    expect(body).toContain(backfillMarker('JOV-1234'));
    expect(extractMigratedIds([body])).toEqual(new Set(['JOV-1234']));
  });
  it('keeps original description and links back to Linear', () => {
    const body = buildBackfillBody(issue);
    expect(body).toContain('Steps to repro');
    expect(body).toContain('https://linear.app/jovie/issue/JOV-1234');
  });
  it('handles a missing description without crashing', () => {
    const body = buildBackfillBody({ ...issue, description: '' });
    expect(body).toContain('_No description in Linear._');
  });
});

describe('extractMigratedIds', () => {
  it('collects all markers across bodies, case-insensitively', () => {
    const ids = extractMigratedIds([
      '<!-- linear-issue: JOV-1 -->',
      'noise',
      'LINEAR-ISSUE: jov-2',
    ]);
    expect(ids).toEqual(new Set(['JOV-1', 'JOV-2']));
  });
  it('is empty for bodies without markers', () => {
    expect(extractMigratedIds(['nothing', ''])).toEqual(new Set());
  });
});

describe('normalizeLinearIssue', () => {
  it('fills defaults for sparse nodes', () => {
    expect(
      normalizeLinearIssue({ identifier: 'JOV-9', title: 'T' })
    ).toMatchObject({
      identifier: 'JOV-9',
      title: 'T',
      description: '',
      priority: 0,
      state: { name: '', type: '' },
      labels: [],
    });
  });
});

describe('runBackfill', () => {
  const issues = [
    {
      identifier: 'JOV-1',
      title: 'One',
      description: 'a',
      priority: 1,
      priorityLabel: 'Urgent',
      url: 'u1',
      state: { name: 'Todo', type: 'unstarted' },
    },
    {
      identifier: 'JOV-2',
      title: 'Two',
      description: 'b',
      priority: 3,
      priorityLabel: 'Medium',
      url: 'u2',
      state: { name: 'In Progress', type: 'started' },
    },
  ];

  it('dry-run writes nothing and counts what it would create', async () => {
    const fileIssue = vi.fn();
    const summary = await runBackfill({
      fetchIssues: async () => issues,
      migratedIds: new Set(),
      fileIssue,
      execute: false,
    });
    expect(fileIssue).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      total: 2,
      created: 2,
      skipped: 0,
      failed: 0,
      dryRun: true,
    });
  });

  it('skips already-migrated identifiers', async () => {
    const fileIssue = vi.fn(() => ({ success: true, identifier: '#10' }));
    const summary = await runBackfill({
      fetchIssues: async () => issues,
      migratedIds: new Set(['JOV-1']),
      fileIssue,
      execute: true,
    });
    expect(fileIssue).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      total: 2,
      created: 1,
      skipped: 1,
      failed: 0,
    });
  });

  it('files issues with mapped labels and title on --execute', async () => {
    const fileIssue = vi.fn(() => ({ success: true, identifier: '#10' }));
    await runBackfill({
      fetchIssues: async () => [issues[0]],
      migratedIds: new Set(),
      fileIssue,
      execute: true,
    });
    expect(fileIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'JOV-1: One',
        labels: ['status:todo', 'P0'],
        body: expect.stringContaining('<!-- linear-issue: JOV-1 -->'),
      })
    );
  });

  it('tallies failures without throwing', async () => {
    const fileIssue = vi.fn(() => ({ success: false, error: 'gh down' }));
    const summary = await runBackfill({
      fetchIssues: async () => issues,
      migratedIds: new Set(),
      fileIssue,
      execute: true,
    });
    expect(summary.failed).toBe(2);
    expect(summary.created).toBe(0);
    expect(summary.failures[0]).toMatchObject({
      identifier: 'JOV-1',
      error: 'gh down',
    });
  });
});

describe('fetchMigratedIds', () => {
  it('parses gh issue list json into a marker id set', () => {
    const exec = vi.fn(() =>
      JSON.stringify([{ body: '<!-- linear-issue: JOV-7 -->' }, { body: 'x' }])
    );
    expect(fetchMigratedIds(exec)).toEqual(new Set(['JOV-7']));
    expect(exec).toHaveBeenCalledOnce();
  });
});

describe('ensureLabels', () => {
  it('creates every backfill label with --force and never throws', () => {
    const exec = vi.fn();
    ensureLabels(exec);
    expect(exec).toHaveBeenCalledTimes(BACKFILL_LABELS.length);
    for (const call of exec.mock.calls) expect(call[0]).toContain('--force');
  });
  it('swallows per-label failures', () => {
    const exec = vi.fn(() => {
      throw new Error('exists');
    });
    expect(() => ensureLabels(exec)).not.toThrow();
  });
});
