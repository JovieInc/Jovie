import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyOperationalFailure } from '../../../../../scripts/hermes/jobs/ci-failure-signatures';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const readHostFile = (name: string) =>
  readFileSync(resolve(repoRoot, '.github/runner-host', name), 'utf8');

describe('Gem runner process-capacity contract', () => {
  it('keeps ten runners while providing measured task headroom', () => {
    expect(readHostFile('ci-runners.slice')).toContain('TasksMax=2048');
    const service = readHostFile('ci-runner-autoscaler.service.snapshot');
    expect(service).toContain('Environment=AUTOSCALER_MAX_RUNNERS=10');
    expect(service).toContain('Environment=AUTOSCALER_RUNNER_CPUS=2');
    expect(service).toContain('Environment=AUTOSCALER_RUNNER_MEMORY_MB=4096');
  });

  it('changes only the slice and preserves the live autoscaler service', () => {
    const installer = readHostFile('install-capacity-contract.sh');
    expect(installer).toContain(
      'systemctl show ci-runner-autoscaler.service --property Environment --value'
    );
    expect(installer).toContain('AUTOSCALER_MAX_RUNNERS=$EXPECTED_MAX_RUNNERS');
    expect(installer).toContain(
      'install -m 0644 "$SOURCE_DIR/ci-runners.slice" /etc/systemd/system/ci-runners.slice'
    );
    expect(installer).not.toContain(
      '/etc/systemd/system/ci-runner-autoscaler.service'
    );
    expect(installer).not.toMatch(/systemctl (?:re)?start/u);
  });

  it('diagnoses saturation before the kernel rejects worker creation', () => {
    const diagnostic = resolve(
      repoRoot,
      '.github/runner-host/diagnose-capacity.sh'
    );
    const saturated = spawnSync(diagnostic, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TASKS_CURRENT: '958',
        RUNNER_TASKS_MAX: '1024',
      },
    });
    expect(saturated.status).toBe(1);
    expect(saturated.stdout).toContain('runner_tasks_status=critical');
    expect(saturated.stdout).toContain('runner_tasks_ratio_pct=93');
    expect(saturated.stdout).toContain(
      'runner_failure_class=dependency-or-environment-drift'
    );

    const repaired = spawnSync(diagnostic, [], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TASKS_CURRENT: '958',
        RUNNER_TASKS_MAX: '2048',
      },
    });
    expect(repaired.status).toBe(0);
    expect(repaired.stdout).toContain('runner_tasks_status=ok');
    expect(repaired.stdout).toContain('runner_tasks_ratio_pct=46');
  });

  it('classifies Node EAGAIN as runner capacity, not a test assertion', () => {
    expect(
      classifyOperationalFailure(
        'Caused by: Error: spawn /opt/hostedtoolcache/node/22.23.1/x64/bin/node EAGAIN'
      )
    ).toMatchObject({
      id: 'runner-process-capacity',
      category: 'dependency-or-environment-drift',
    });
    expect(
      classifyOperationalFailure('AssertionError: expected 1 to be 2')
    ).toBe(null);
  });

  it('classifies proactive slice saturation diagnostics', () => {
    expect(
      classifyOperationalFailure(
        'runner_tasks_status=critical\nrunner_tasks_ratio_pct=93'
      )
    ).toMatchObject({ id: 'runner-process-capacity' });
  });
});
