import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HumanHoldoutSet } from '../../lib/eval/calibration';
import type { JudgeVerdict, StageJudge } from '../design-ci-judge-dispatch';
import {
  calibrateVisualJudges,
  failedCalibrationJudges,
  JUDGE_CALIBRATION_SCHEMA,
} from './judge-calibration';
import { writeJson } from './receipts';

const holdout: HumanHoldoutSet = {
  schemaVersion: 1,
  labeledAt: '2026-10-03T00:00:00.000Z',
  items: [
    { id: 'accepted-1', caseId: 'shots/accepted-1.png', humanLabel: 'pass' },
    { id: 'accepted-2', caseId: 'shots/accepted-2.png', humanLabel: 'pass' },
    { id: 'escape-1', caseId: 'shots/escape-1.png', humanLabel: 'fail' },
    { id: 'escape-2', caseId: 'shots/escape-2.png', humanLabel: 'fail' },
  ],
};

/** A judge that answers from a fixed table keyed by screenshot file name. */
function judge(
  id: string,
  verdicts: Record<string, JudgeVerdict>
): StageJudge & { seen: string[] } {
  const seen: string[] = [];
  return {
    id,
    seen,
    async run(input) {
      const name = (input.capture ?? '').split('/').at(-1) ?? '';
      seen.push(input.capture ?? '');
      const verdict = verdicts[name] ?? 'insufficient';
      return {
        judge: id,
        score: verdict === 'pass' ? 0.9 : 0.1,
        verdict,
        reason: null,
        notes: '',
      };
    },
  };
}

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('calibrateVisualJudges', () => {
  it('ranks judges by agreement with the founder labels and fails the rest', async () => {
    const sharp = judge('openai/gpt-5.6-luna', {
      'accepted-1.png': 'pass',
      'accepted-2.png': 'pass',
      'escape-1.png': 'fail',
      'escape-2.png': 'fail',
    });
    // Passes everything: agrees half the time, kappa 0.
    const lenient = judge('google/gemini-3-pro', {
      'accepted-1.png': 'pass',
      'accepted-2.png': 'pass',
      'escape-1.png': 'pass',
      'escape-2.png': 'pass',
    });
    const silent = judge('anthropic/claude-opus-5.5', {
      'accepted-1.png': 'pass',
    });

    const receipt = await calibrateVisualJudges({
      holdout,
      judges: [lenient, silent, sharp],
      baseDir: '/corpus',
      now: () => new Date('2026-10-04T00:00:00.000Z'),
    });

    expect(receipt.schema).toBe(JUDGE_CALIBRATION_SCHEMA);
    expect(receipt.judges.map(j => [j.judge, j.passed, j.kappa])).toEqual([
      ['openai/gpt-5.6-luna', true, 1],
      ['google/gemini-3-pro', false, 0],
      ['anthropic/claude-opus-5.5', false, null],
    ]);
    expect(receipt.judges[1]?.disagreements).toEqual(['escape-1', 'escape-2']);
    expect(receipt.judges[2]?.missing).toEqual([
      'accepted-2',
      'escape-1',
      'escape-2',
    ]);
    // Every judge saw the same screenshots, resolved against the corpus dir.
    expect(sharp.seen).toEqual(lenient.seen);
    expect(sharp.seen[0]).toBe('/corpus/shots/accepted-1.png');
  });

  it('reads back the judges a receipt failed, and nothing without one', () => {
    dir = mkdtempSync(join(tmpdir(), 'judge-calibration-'));
    const path = join(dir, 'judge-calibration.json');

    expect(failedCalibrationJudges(path).size).toBe(0);

    writeJson(path, {
      schema: JUDGE_CALIBRATION_SCHEMA,
      labeledAt: holdout.labeledAt,
      threshold: 0.6,
      calibratedAt: '2026-10-04T00:00:00.000Z',
      judges: [
        {
          judge: 'a/one',
          passed: true,
          kappa: 1,
          pairedCount: 4,
          missing: [],
          disagreements: [],
        },
        {
          judge: 'b/two',
          passed: false,
          kappa: 0,
          pairedCount: 4,
          missing: [],
          disagreements: [],
        },
      ],
    });
    expect([...failedCalibrationJudges(path)]).toEqual(['b/two']);
  });
});
