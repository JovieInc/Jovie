import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveStageEvents } from '../stage-derive.mjs';

const MANIFEST = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../docs/metrics/stage-manifest.json'),
    'utf8'
  )
);
const NOW = Date.parse('2026-11-12T12:00:00Z');
const ago = minutes => new Date(NOW - minutes * 60_000).toISOString();
const suite = (conclusion, minutes) => ({
  conclusion,
  createdAt: ago(minutes),
  updatedAt: ago(minutes),
  event: 'pull_request',
});
const redThenGreen = timeline => ({
  prs: [
    {
      repository: 'JovieInc/Jovie',
      number: 9,
      headRefName: 'feature/agent-wip',
      timeline,
      commits: [
        {
          oid: 'aaaaaaaaaaaaaaaa',
          committedDate: ago(200),
          rollup: 'FAILURE',
          suites: [suite('FAILURE', 180)],
        },
        {
          oid: 'bbbb',
          committedDate: ago(160),
          rollup: 'SUCCESS',
          suites: [suite('SUCCESS', 130)],
        },
      ],
    },
  ],
});
const split = (raw, type) =>
  deriveStageEvents(raw, MANIFEST)
    .filter(e => e.entityType === type)
    .map(e => [e.entityId, e.stage, e.enteredAt, e.exitedAt]);
const DWELL = [
  ['JovieInc/Jovie#9@aaaaaaaaaaaa', 'red', ago(180), ago(130)],
  ['JovieInc/Jovie#9@aaaaaaaaaaaa', 'green', ago(130), ago(130)],
];

describe('red-to-green dwell per red head, split writer vs repair', () => {
  it('counts an episode with a lane-fix label inside it as a repair', () => {
    const raw = redThenGreen([
      { type: 'labeled', at: ago(170), label: 'lane-fix-red' },
    ]);
    expect(split(raw, 'remediation-repair')).toEqual(DWELL);
    expect(split(raw, 'remediation-writer')).toEqual([]);
  });

  it('counts an episode its writer greened with no repair label as the writer', () => {
    const raw = redThenGreen([
      { type: 'labeled', at: ago(300), label: 'lane-fix-red' },
    ]);
    expect(split(raw, 'remediation-writer')).toEqual(DWELL);
    expect(split(raw, 'remediation-repair')).toEqual([]);
  });

  it('leaves a truncated timeline unsplit: it cannot prove no repair label', () => {
    const raw = redThenGreen([]);
    raw.prs[0].timelineTruncated = true;
    expect(split(raw, 'remediation-writer')).toEqual([]);
    expect(split(raw, 'remediation-repair')).toEqual([]);
  });
});
