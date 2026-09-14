import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyReleaseWave,
  DEFAULT_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS,
  PRODUCTION_CONTROLLER_WORKFLOW_PATH,
  runCli,
} from '../release-wave-admission.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const AUTOENROLL_WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/merge-queue-autoenroll.yml'),
  'utf8'
);
const DRAIN_SCRIPT = readFileSync(
  resolve(REPO_ROOT, 'scripts/drain-pr-queue.sh'),
  'utf8'
);
const RELEASE_WAVE_STEP = (() => {
  const marker = '      - name: Resolve active production release wave\n';
  const start = AUTOENROLL_WORKFLOW.indexOf(marker);
  if (start < 0) throw new Error('release-wave workflow step is missing');
  const end = AUTOENROLL_WORKFLOW.indexOf(
    '      - name: Resolve exact admission scope\n',
    start
  );
  if (end < 0)
    throw new Error('release-wave workflow step boundary is missing');
  const block = AUTOENROLL_WORKFLOW.slice(start, end);
  const runMarker = '        run: |\n';
  const runStart = block.indexOf(runMarker);
  if (runStart < 0) throw new Error('release-wave workflow run is missing');
  return block
    .slice(runStart + runMarker.length)
    .split('\n')
    .map(line => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
})();

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

function runReleaseWaveStep({
  queuedRuns = [],
  inProgressRuns = [],
  malformedStatus = '',
  failStatus = '',
} = {}) {
  const root = mkdtempSync(resolve(tmpdir(), 'release-wave-step-'));
  const bin = resolve(root, 'bin');
  const output = resolve(root, 'output');
  const summary = resolve(root, 'summary');
  mkdirSync(bin);
  writeFileSync(output, '');
  writeFileSync(summary, '');
  writeFileSync(
    resolve(bin, 'gh'),
    `#!/usr/bin/env bash
case "\$*" in
  *"status=queued"*)
    ${failStatus === 'queued' ? 'exit 42' : malformedStatus === 'queued' ? "printf '%s\\n' '{\"unexpected\":true}'" : `printf '%s\\n' '${JSON.stringify([{ workflow_runs: queuedRuns }])}'`}
    ;;
  *"status=in_progress"*)
    ${failStatus === 'in_progress' ? 'exit 43' : malformedStatus === 'in_progress' ? "printf '%s\\n' 'null'" : `printf '%s\\n' '${JSON.stringify([{ workflow_runs: inProgressRuns }])}'`}
    ;;
  *) printf '%s\\n' '[]' ;;
esac
`
  );
  chmodSync(resolve(bin, 'gh'), 0o755);
  try {
    const result = spawnSync(
      'bash',
      [
        '--noprofile',
        '--norc',
        '-e',
        '-o',
        'pipefail',
        '-c',
        RELEASE_WAVE_STEP,
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          GH_TOKEN: 'test-read-token',
          REPO: 'JovieInc/Jovie',
          MAIN_SHA,
          RELEASE_WAVE_HOLD_MAX_AGE_SECONDS: '1800',
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
        },
      }
    );
    return {
      result,
      outputs: Object.fromEntries(
        readFileSync(output, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => line.split('=', 2))
      ),
      summary: readFileSync(summary, 'utf8'),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('release-wave admission backpressure', () => {
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

  it('projects the active run through the workflow and keeps an older head held', () => {
    const { result, outputs, summary } = runReleaseWaveStep({
      inProgressRuns: [
        {
          id: 801,
          status: 'in_progress',
          path: PRODUCTION_CONTROLLER_WORKFLOW_PATH,
          head_branch: 'main',
          head_sha: OLD_HEAD_A,
          created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        },
      ],
    });

    expect(result.status).toBe(0);
    expect(outputs).toMatchObject({
      hold: '1',
      reason: 'controller-wave-draining',
      run_id: '801',
    });
    expect(outputs.expires_at).toMatch(/^20[0-9]{2}-/);
    expect(summary).toContain('jovie-release-wave-admission/v1');
  });

  it('blocks the workflow when the controller API response shape is malformed', () => {
    const { result, outputs, summary } = runReleaseWaveStep({
      malformedStatus: 'queued',
    });

    expect(result.status).toBe(2);
    expect(outputs).toMatchObject({
      hold: '1',
      reason: 'controller-state-unavailable',
      expires_at: '',
      run_id: 'unknown',
    });
    expect(summary).toContain('controller-state-unavailable');
    expect(result.stderr).toContain('native enrollment is blocked');
  });

  it('blocks the workflow when the controller API read fails', () => {
    const { result, outputs, summary } = runReleaseWaveStep({
      failStatus: 'in_progress',
    });

    expect(result.status).toBe(2);
    expect(outputs).toMatchObject({
      hold: '1',
      reason: 'controller-state-unavailable',
      expires_at: '',
      run_id: 'unknown',
    });
    expect(summary).toContain('"expiresAt": null');
    expect(result.stderr).toContain('native enrollment is blocked');
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
  });

  it('wires the bounded receipt to new enrollment only', () => {
    expect(AUTOENROLL_WORKFLOW).toContain(
      '- name: Resolve active production release wave'
    );
    expect(AUTOENROLL_WORKFLOW).toContain(
      'node scripts/lib/release-wave-admission.mjs classify'
    );
    expect(AUTOENROLL_WORKFLOW).toContain('for status in queued in_progress');
    expect(AUTOENROLL_WORKFLOW).toContain('status=$status');
    expect(AUTOENROLL_WORKFLOW).toContain(
      'error("malformed controller run response")'
    );
    expect(AUTOENROLL_WORKFLOW).toContain(
      'Production Controller state is unavailable or malformed'
    );
    expect(AUTOENROLL_WORKFLOW).not.toContain(
      'RELEASE_WAVE_OBSERVATION_HOLD_SECONDS'
    );
    expect(AUTOENROLL_WORKFLOW).toContain(
      'DRAIN_RELEASE_WAVE_HOLD: $' + '{{ steps.release-wave.outputs.hold }}'
    );
    expect(AUTOENROLL_WORKFLOW).toContain(
      "DRAIN_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS: '1800'"
    );
    expect(DRAIN_SCRIPT).toContain('RELEASE_WAVE_HOLD_ACTIVE=0');
    expect(DRAIN_SCRIPT).toContain('ENROLL_SLOTS=0');
    expect(DRAIN_SCRIPT).toContain('DRAIN_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS');
    expect(DRAIN_SCRIPT).not.toContain(
      'DRAIN_RELEASE_WAVE_OBSERVATION_HOLD_SECONDS'
    );
    expect(DRAIN_SCRIPT).toContain('&& "$RELEASE_WAVE_HOLD_ACTIVE" != "1"');
    expect(DRAIN_SCRIPT).toContain(
      '=== DEQUEUE (hard gates → queue removal) ==='
    );
    expect(DEFAULT_RELEASE_WAVE_HOLD_MAX_AGE_SECONDS).toBe(1800);
  });
});
