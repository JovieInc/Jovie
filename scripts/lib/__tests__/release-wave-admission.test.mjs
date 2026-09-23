import { describe, expect, it } from 'vitest';
import {
  classifyReleaseWave,
  PRODUCTION_CONTROLLER_WORKFLOW_PATH,
  runCli,
} from '../release-wave-admission.mjs';

// NOTE: the merge-queue auto-enroll controller
// (.github/workflows/merge-queue-autoenroll.yml) was deleted in JOV-6526.
// The workflow-step projection tests that executed its embedded bash steps
// were removed with it; the pure classifier + CLI contract tests below remain.

const NOW = Date.parse('2026-09-14T19:00:00Z');
const MAIN_SHA = 'c'.repeat(40);
const OLD_HEAD_A = 'a'.repeat(40);
const OLD_HEAD_B = 'b'.repeat(40);

/**
 * @typedef {object} ControllerRunOptions
 * @property {number|string} [id]
 * @property {string} [headSha]
 * @property {string} [status]
 * @property {string} [createdAt]
 * @property {string} [path]
 * @property {string} [branch]
 */

/** @param {ControllerRunOptions} [options] */
function controllerRun({
  id,
  headSha,
  status = 'in_progress',
  createdAt = '2026-09-14T18:50:00Z',
  path = PRODUCTION_CONTROLLER_WORKFLOW_PATH,
  branch = 'main',
} = {}) {
  return {
    id,
    status,
    path,
    head_branch: branch,
    head_sha: headSha,
    created_at: createdAt,
  };
}

describe('release-wave admission backpressure', () => {
  it('retains a pending successor after its predecessor expires without renewing either deadline', () => {
    const prior = controllerRun({
      id: 35452908749,
      headSha: '3dfba7b78d064bb9463963b1166a9b2d1b1b3b71',
      createdAt: '2026-09-19T15:47:31Z',
    });
    const successor = controllerRun({
      id: 35454112267,
      headSha: '1e3c2dc4fea2c052f77fab0ad1fcef5ce4371cb7',
      createdAt: '2026-09-19T16:10:38Z',
      status: 'pending',
    });
    const classifyAt = (now, status = 'pending') =>
      classifyReleaseWave([prior, { ...successor, status }, successor], {
        currentMainSha: successor.head_sha,
        now: Date.parse(now),
      });

    expect(classifyAt('2026-09-19T16:17:31Z')).toMatchObject({
      hold: true,
      activeRunId: '35452908749',
      activeRunCount: 2,
      expiresAt: '2026-09-19T16:17:31Z',
    });
    for (const now of ['2026-09-19T16:18:40Z', '2026-09-19T16:25:00Z']) {
      expect(classifyAt(now)).toMatchObject({
        hold: true,
        activeRunId: '35454112267',
        activeRunStatus: 'pending',
        activeRunCount: 1,
        expiresAt: '2026-09-19T16:40:38Z',
      });
    }
    expect(classifyAt('2026-09-19T16:21:03Z', 'in_progress')).toMatchObject({
      hold: true,
      activeRunStatus: 'in_progress',
      expiresAt: '2026-09-19T16:40:38Z',
    });
    expect(classifyAt('2026-09-19T16:40:38Z')).toMatchObject({
      hold: true,
      remainingSeconds: 0,
    });
    expect(classifyAt('2026-09-19T16:40:38.001Z')).toMatchObject({
      hold: false,
      reason: 'release-wave-expired',
      expiresAt: '2026-09-19T16:40:38Z',
    });
    expect(
      classifyReleaseWave([prior, { ...successor, status: 'completed' }], {
        currentMainSha: successor.head_sha,
        now: Date.parse('2026-09-19T16:25:00Z'),
      }).hold
    ).toBe(false);
  });

  it('holds an active controller run for the current main wave', () => {
    const result = classifyReleaseWave(
      [controllerRun({ id: 101, headSha: MAIN_SHA })],
      { currentMainSha: MAIN_SHA, now: NOW }
    );

    expect(result.hold).toBe(true);
    expect(result.reason).toBe('controller-wave-active');
    expect(result.activeRunId).toBe('101');
    expect(result.activeRunCount).toBe(1);
    expect(result.expiresAt).toBe('2026-09-14T19:20:00Z');
    expect(result.remainingSeconds).toBe(1200);
  });

  it('keeps the hold while main advances across two superseded waves', () => {
    const result = classifyReleaseWave(
      [
        controllerRun({ id: 201, headSha: OLD_HEAD_A }),
        controllerRun({
          id: 202,
          headSha: OLD_HEAD_B,
          createdAt: '2026-09-14T18:55:00Z',
        }),
      ],
      { currentMainSha: MAIN_SHA, now: NOW }
    );

    expect(result.hold).toBe(true);
    expect(result.reason).toBe('controller-wave-draining');
    expect(result.activeRunId).toBe('201');
    expect(result.activeRunIds).toEqual(['201', '202']);
    expect(result.activeRunHeadSha).toBe(OLD_HEAD_A);
    expect(result.activeRunCount).toBe(2);
    expect(result.expiresAt).toBe('2026-09-14T19:20:00Z');
    expect(result.expiresAt).not.toBeNull();
  });

  it('uses only active production-controller runs for ownership', () => {
    const result = classifyReleaseWave(
      [
        controllerRun({ id: 301, headSha: OLD_HEAD_A, status: 'completed' }),
        controllerRun({
          id: 302,
          headSha: OLD_HEAD_B,
          path: '.github/workflows/production-release.yml',
        }),
        controllerRun({
          id: 303,
          headSha: MAIN_SHA,
          branch: 'codex/feature',
        }),
        controllerRun({
          id: 304,
          headSha: MAIN_SHA,
          status: 'queued',
        }),
      ],
      { currentMainSha: MAIN_SHA, now: NOW }
    );

    expect(result.hold).toBe(true);
    expect(result.reason).toBe('controller-wave-active');
    expect(result.activeRunIds).toEqual(['304']);
  });

  it('releases the hold after terminal completion', () => {
    const result = classifyReleaseWave(
      [controllerRun({ id: 401, headSha: OLD_HEAD_A, status: 'completed' })],
      { currentMainSha: MAIN_SHA, now: NOW }
    );

    expect(result.hold).toBe(false);
    expect(result.reason).toBe('no-active-controller');
    expect(result.activeRunCount).toBe(0);
    expect(result.expiresAt).toBeNull();
  });

  it('releases an expired wave and retains a fresh wave when both are present', () => {
    const result = classifyReleaseWave(
      [
        controllerRun({
          id: 501,
          headSha: OLD_HEAD_A,
          createdAt: '2026-09-14T18:00:00Z',
        }),
        controllerRun({
          id: 502,
          headSha: OLD_HEAD_B,
          createdAt: '2026-09-14T18:55:00Z',
        }),
      ],
      { currentMainSha: MAIN_SHA, now: NOW }
    );

    expect(result.hold).toBe(true);
    expect(result.reason).toBe('controller-wave-draining');
    expect(result.activeRunIds).toEqual(['502']);
    expect(result.expiresAt).toBe('2026-09-14T19:25:00Z');
  });

  it('releases when every active run has passed the bounded age', () => {
    const result = classifyReleaseWave(
      {
        workflow_runs: [
          controllerRun({
            id: 503,
            headSha: OLD_HEAD_A,
            createdAt: '2026-09-14T18:00:00Z',
          }),
        ],
      },
      { currentMainSha: MAIN_SHA, now: NOW }
    );

    expect(result.hold).toBe(false);
    expect(result.reason).toBe('release-wave-expired');
    expect(result.activeRunId).toBe('503');
    expect(result.expiresAt).toBe('2026-09-14T18:30:00Z');
  });

  it('blocks on a future-dated controller clock without inventing an expiry', () => {
    const first = classifyReleaseWave(
      [
        controllerRun({
          id: 601,
          headSha: MAIN_SHA,
          createdAt: '2026-09-14T20:00:00Z',
        }),
      ],
      { currentMainSha: MAIN_SHA, now: NOW, maxAgeSeconds: 600 }
    );
    const second = classifyReleaseWave(
      [
        controllerRun({
          id: 601,
          headSha: MAIN_SHA,
          createdAt: '2026-09-14T20:00:00Z',
        }),
      ],
      { currentMainSha: MAIN_SHA, now: NOW + 5 * 60_000, maxAgeSeconds: 600 }
    );

    for (const result of [first, second]) {
      expect(result.hold).toBe(true);
      expect(result.reason).toBe('controller-state-malformed');
      expect(result.expiresAt).toBeNull();
    }
    expect(second.observedAt).not.toBe(first.observedAt);
  });

  it('blocks malformed individual records but ignores valid nonmatching records', () => {
    expect(
      classifyReleaseWave([{}], { currentMainSha: MAIN_SHA, now: NOW })
    ).toMatchObject({
      hold: true,
      reason: 'controller-state-malformed',
      expiresAt: null,
    });

    /** @type {Array<[string, object]>} */
    const malformed = [
      [
        'id',
        { ...controllerRun({ id: 650, headSha: MAIN_SHA }), id: undefined },
      ],
      [
        'status',
        { ...controllerRun({ id: 650, headSha: MAIN_SHA }), status: undefined },
      ],
      [
        'timestamp',
        {
          ...controllerRun({ id: 650, headSha: MAIN_SHA }),
          created_at: undefined,
        },
      ],
      [
        'head_sha',
        {
          ...controllerRun({ id: 650, headSha: MAIN_SHA }),
          head_sha: undefined,
        },
      ],
      [
        'unknown-status',
        { ...controllerRun({ id: 650, headSha: MAIN_SHA }), status: 'bogus' },
      ],
    ];

    for (const [field, run] of malformed) {
      const result = classifyReleaseWave([run], {
        currentMainSha: MAIN_SHA,
        now: NOW,
      });
      expect(result.hold, field).toBe(true);
      expect(result.reason, field).toBe('controller-state-malformed');
      expect(result.expiresAt, field).toBeNull();
    }
  });

  it('rejects an invalid main SHA before classifying controller state', () => {
    expect(() =>
      classifyReleaseWave([controllerRun({ id: 701, headSha: OLD_HEAD_A })], {
        currentMainSha: 'not-a-sha',
        now: NOW,
      })
    ).toThrow(/currentMainSha must be an exact 40-character SHA/);
  });

  it('classifies a malformed controller response as unknown', () => {
    const result = classifyReleaseWave(
      { workflow_runs: 'not-an-array' },
      { currentMainSha: MAIN_SHA, now: NOW }
    );

    expect(result.hold).toBe(true);
    expect(result.reason).toBe('controller-state-malformed');
    expect(result.expiresAt).toBeNull();
  });

  it('rejects an unbounded age or non-finite observation clock', () => {
    expect(() =>
      classifyReleaseWave([], {
        currentMainSha: MAIN_SHA,
        now: NOW,
        maxAgeSeconds: 3_601,
      })
    ).toThrow(/maxAgeSeconds/);
    expect(() =>
      classifyReleaseWave([], { currentMainSha: MAIN_SHA, now: Number.NaN })
    ).toThrow(/now must be a finite epoch/);
  });

  it('renders a typed CLI receipt and a malformed-input failure', async () => {
    let output = '';
    const code = await runCli(
      ['classify', '--main-sha', MAIN_SHA, '--max-age-seconds', '600'],
      {
        input: JSON.stringify([
          controllerRun({
            id: 702,
            headSha: MAIN_SHA,
            createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          }),
        ]),
        write: value => {
          output += value;
        },
      }
    );
    expect(code).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      schema: 'jovie-release-wave-admission/v1',
      hold: true,
      activeRunId: '702',
      maxAgeSeconds: 600,
    });

    let malformedOutput = '';
    const malformedCode = await runCli(['classify', '--main-sha', MAIN_SHA], {
      input: '{malformed',
      write: value => {
        malformedOutput += value;
      },
    });
    expect(malformedCode).toBe(2);
    expect(JSON.parse(malformedOutput)).toMatchObject({
      hold: true,
      reason: 'controller-state-malformed',
      expiresAt: null,
    });

    let malformedRecordOutput = '';
    const malformedRecordCode = await runCli(
      ['classify', '--main-sha', MAIN_SHA],
      {
        input: JSON.stringify([{}]),
        write: value => {
          malformedRecordOutput += value;
        },
      }
    );
    expect(malformedRecordCode).toBe(2);
    expect(JSON.parse(malformedRecordOutput)).toMatchObject({
      hold: true,
      reason: 'controller-state-malformed',
      expiresAt: null,
    });
  });
});
