import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getStepBlock } from './deploy-workflow-yaml';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
);
const healthPath = resolve(
  repoRoot,
  '.github/workflows/production-controller-health.yml'
);

describe('production controller health missing-marker page (JOV-8157)', () => {
  const health = readFileSync(healthPath, 'utf8');
  const evaluation = getStepBlock(
    health,
    'Evaluate exact current production controller'
  );

  it('pages controller_completed_without_marker only after a successful controller', () => {
    const missingMarkerAt = evaluation.indexOf(
      'incident controller_completed_without_marker'
    );
    const terminalHandoffAt = evaluation.indexOf(
      'terminal_reason="$(controller_terminal_recovery_reason "$controller_conclusion")"'
    );
    expect(missingMarkerAt).toBeGreaterThan(0);
    expect(terminalHandoffAt).toBeGreaterThan(missingMarkerAt);
    expect(evaluation.slice(missingMarkerAt, terminalHandoffAt)).toContain(
      'fi'
    );
    expect(evaluation).toContain('incident malformed_controller_conclusion');
    expect(evaluation).toContain('incident controller_failed');
    expect(evaluation.indexOf('incident controller_failed')).toBeGreaterThan(
      terminalHandoffAt
    );
    expect(evaluation).toContain('startswith("Production Release /")');
  });

  it('treats a release-started terminal failure as release-owned', () => {
    const releaseStartedMatch =
      /if jq -e '\n([\s\S]*?)\n\s+' >\/dev\/null <<<"\$controller_jobs"; then\n\s+release_started=1/.exec(
        evaluation
      );
    expect(releaseStartedMatch).not.toBeNull();
    const filter = releaseStartedMatch?.[1] ?? 'false';
    const jobs = (name: string) =>
      JSON.stringify({ jobs: [{ name }] });
    expect(
      spawnSync('jq', ['-e', filter], {
        encoding: 'utf8',
        input: jobs('Production Release / Promote to Production'),
      }).status
    ).toBe(0);
    expect(
      spawnSync('jq', ['-e', filter], {
        encoding: 'utf8',
        input: jobs('Authorize exact main CI evidence'),
      }).status
    ).not.toBe(0);
  });

  it('maps non-success conclusions away from the missing-marker class', () => {
    const match =
      / {10}(controller_terminal_recovery_reason\(\) \{[\s\S]*?\n {10}\})/.exec(
        evaluation
      );
    expect(match).not.toBeNull();
    const fn = (match?.[1] ?? '').replace(/^ {10}/gm, '');
    for (const [conclusion, expected] of [
      ['failure', 'controller_terminal_failure'],
      ['cancelled', 'controller_terminal_cancelled'],
      ['timed_out', 'controller_terminal_timed_out'],
      ['startup_failure', 'controller_terminal_startup_failure'],
      ['neutral', 'controller_terminal_neutral'],
      ['skipped', 'controller_terminal_skipped'],
      ['stale', 'controller_terminal_stale'],
      ['success', 'malformed'],
      ['action_required', 'malformed'],
      ['', 'malformed'],
    ] as const) {
      const classification = spawnSync(
        'bash',
        [
          '-c',
          `${fn}\ncontroller_terminal_recovery_reason "$1"`,
          'controller-terminal-reason',
          conclusion,
        ],
        { encoding: 'utf8' }
      );
      expect(classification.status).toBe(0);
      expect(classification.stdout.trim()).toBe(expected);
    }
  });
});
