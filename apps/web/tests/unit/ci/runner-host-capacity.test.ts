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
import { afterEach, describe, expect, it } from 'vitest';
import { diagnoseCiFailure } from '../../../../../scripts/hermes/jobs/ci-failure-diagnosis';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const readHostFile = (name: string) =>
  readFileSync(resolve(repoRoot, '.github/runner-host', name), 'utf8');
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const runReconciler = ({
  current,
  maximum,
  maxRunners = '10',
}: {
  current: string;
  maximum: string;
  maxRunners?: string;
}) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'runner-capacity-'));
  temporaryDirectories.push(directory);
  const systemctl = resolve(directory, 'systemctl');
  const state = resolve(directory, 'tasks-max');
  const mutations = resolve(directory, 'mutations');
  writeFileSync(state, `${maximum}\n`);
  writeFileSync(
    systemctl,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "show" && "$2" == "ci-runner-autoscaler.service" ]]; then
  echo "AUTOSCALER_MAX_RUNNERS=\${FAKE_MAX_RUNNERS} AUTOSCALER_RUNNER_CPUS=2"
elif [[ "$1" == "show" && "$2" == "ci-runners.slice" && "$4" == "TasksMax" ]]; then
  cat "\${FAKE_TASKS_MAX_STATE}"
elif [[ "$1" == "show" && "$2" == "ci-runners.slice" && "$4" == "TasksCurrent" ]]; then
  echo "\${FAKE_TASKS_CURRENT}"
elif [[ "$1" == "set-property" && "$2" == "ci-runners.slice" ]]; then
  printf '%s\\n' "$3" >> "\${FAKE_MUTATIONS}"
  printf '%s\\n' "\${3#TasksMax=}" > "\${FAKE_TASKS_MAX_STATE}"
else
  printf 'unexpected systemctl call: %s\\n' "$*" >&2
  exit 91
fi
`
  );
  chmodSync(systemctl, 0o755);
  const result = spawnSync(
    resolve(repoRoot, '.github/runner-host/reconcile-capacity.sh'),
    [],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_MAX_RUNNERS: maxRunners,
        FAKE_MUTATIONS: mutations,
        FAKE_TASKS_CURRENT: current,
        FAKE_TASKS_MAX_STATE: state,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
      },
    }
  );
  return {
    ...result,
    effectiveMaximum: readFileSync(state, 'utf8').trim(),
    mutations: readFileSync(mutations, { encoding: 'utf8', flag: 'a+' }),
  };
};

const runInstaller = ({
  autoscalerEnvironment = 'AUTOSCALER_MAX_RUNNERS=10 AUTOSCALER_RUNNER_CPUS=2',
  current = '958',
  maximum = '1024',
  mode = 'live',
}: {
  autoscalerEnvironment?: string;
  current?: string;
  maximum?: string;
  mode?: 'live' | 'stage';
}) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'runner-installer-'));
  temporaryDirectories.push(directory);
  const binDirectory = resolve(directory, 'bin');
  const installRoot = resolve(directory, 'root');
  const events = resolve(directory, 'events');
  const state = resolve(directory, 'tasks-max');
  mkdirSync(binDirectory, { recursive: true });
  mkdirSync(resolve(installRoot, 'etc/systemd/system'), { recursive: true });
  writeFileSync(events, '');
  writeFileSync(state, `${maximum}\n`);

  const install = resolve(binDirectory, 'install');
  writeFileSync(
    install,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'install %s\\n' "$*" >> "\${FAKE_EVENTS}"
exec /usr/bin/install "$@"
`
  );
  chmodSync(install, 0o755);

  const systemctl = resolve(binDirectory, 'systemctl');
  writeFileSync(
    systemctl,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'systemctl %s\\n' "$*" >> "\${FAKE_EVENTS}"
if [[ "$1" == "show" && "$2" == "ci-runner-autoscaler.service" ]]; then
  echo "\${FAKE_AUTOSCALER_ENVIRONMENT}"
elif [[ "$1" == "show" && "$2" == "ci-runners.slice" && "$4" == "TasksMax" ]]; then
  cat "\${FAKE_TASKS_MAX_STATE}"
elif [[ "$1" == "show" && "$2" == "ci-runners.slice" && "$4" == "TasksCurrent" ]]; then
  echo "\${FAKE_TASKS_CURRENT}"
elif [[ "$1" == "set-property" && "$2" == "ci-runners.slice" ]]; then
  printf '%s\\n' "\${3#TasksMax=}" > "\${FAKE_TASKS_MAX_STATE}"
elif [[ "$1" == "daemon-reload" ]]; then
  exit 0
elif [[ "$1" == "enable" && "$2" == "ci-runner-capacity-reconcile.timer" ]]; then
  exit 0
elif [[ "$1" == "start" && "$2" == "ci-runner-capacity-reconcile.timer" ]]; then
  exit 0
else
  printf 'unexpected systemctl call: %s\\n' "$*" >&2
  exit 91
fi
`
  );
  chmodSync(systemctl, 0o755);

  const installer = resolve(
    repoRoot,
    '.github/runner-host/install-capacity-contract.sh'
  );
  const result = spawnSync(
    mode === 'stage' ? installer : '/bin/bash',
    mode === 'stage'
      ? ['--apply']
      : [
          '-c',
          'source "$1"; apply_live_contract "$2"',
          'runner-installer-test',
          installer,
          installRoot,
        ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_AUTOSCALER_ENVIRONMENT: autoscalerEnvironment,
        FAKE_EVENTS: events,
        FAKE_TASKS_CURRENT: current,
        FAKE_TASKS_MAX_STATE: state,
        PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
        ...(mode === 'stage' ? { RUNNER_HOST_INSTALL_ROOT: installRoot } : {}),
      },
    }
  );

  return {
    ...result,
    events: readFileSync(events, 'utf8').trim().split('\n').filter(Boolean),
  };
};

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
    expect(installer).toContain('ci-runner-capacity-reconcile.timer');
    expect(installer).not.toContain(
      '/etc/systemd/system/ci-runner-autoscaler.service'
    );
    expect(installer).not.toMatch(
      /systemctl (?:re)?start ci-runner-autoscaler\.service/u
    );
  });

  it('stages files without reading or mutating live systemd state', () => {
    const result = runInstaller({ mode: 'stage' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('live host unchanged');
    expect(result.events.some(event => event.startsWith('install '))).toBe(
      true
    );
    expect(result.events.some(event => event.startsWith('systemctl '))).toBe(
      false
    );
  });

  it.each([
    {
      name: 'wrong cap',
      autoscalerEnvironment: 'AUTOSCALER_MAX_RUNNERS=11',
      maximum: '1024',
    },
    {
      name: 'duplicate cap',
      autoscalerEnvironment:
        'AUTOSCALER_MAX_RUNNERS=10 AUTOSCALER_MAX_RUNNERS=10',
      maximum: '1024',
    },
    {
      name: 'missing cap',
      autoscalerEnvironment: 'AUTOSCALER_RUNNER_CPUS=2',
      maximum: '1024',
    },
    {
      name: 'invalid TasksMax',
      autoscalerEnvironment: 'AUTOSCALER_MAX_RUNNERS=10',
      maximum: 'infinity',
    },
    {
      name: 'invalid TasksCurrent',
      autoscalerEnvironment: 'AUTOSCALER_MAX_RUNNERS=10',
      current: 'unknown',
      maximum: '1024',
    },
    {
      name: 'unsafe downward clamp',
      autoscalerEnvironment: 'AUTOSCALER_MAX_RUNNERS=10',
      current: '1700',
      maximum: '4096',
    },
  ])('fails $name preflight before any host mutation', fixture => {
    const result = runInstaller(fixture);

    expect(result.status).not.toBe(0);
    expect(result.events.some(event => event.startsWith('install '))).toBe(
      false
    );
    expect(
      result.events.some(event =>
        /^systemctl (?:daemon-reload|enable|set-property)\b/u.test(event)
      )
    ).toBe(false);
  });

  it('preflights before installation and starts the enabled timer last', () => {
    const result = runInstaller({});

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('runner_capacity_preflight=passed');
    expect(result.events.slice(0, 4)).toEqual([
      'systemctl show ci-runner-autoscaler.service --property Environment --value',
      'systemctl show ci-runners.slice --property TasksMax --value',
      'systemctl show ci-runners.slice --property TasksCurrent --value',
      expect.stringMatching(/^install /u),
    ]);
    const reconciliation = result.events.findIndex(event =>
      event.startsWith('systemctl set-property ci-runners.slice')
    );
    const timerEnable = result.events.indexOf(
      'systemctl enable ci-runner-capacity-reconcile.timer'
    );
    const timerStart = result.events.indexOf(
      'systemctl start ci-runner-capacity-reconcile.timer'
    );
    expect(reconciliation).toBeGreaterThan(3);
    expect(timerEnable).toBeLessThan(reconciliation);
    expect(timerStart).toBeGreaterThan(reconciliation);
    expect(timerStart).toBe(result.events.length - 1);
  });

  it('starts the timer and preserves a saturated reconciliation failure', () => {
    const result = runInstaller({ current: '1700', maximum: '2048' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('runner_tasks_status=warning');
    expect(result.events).toContain(
      'systemctl enable ci-runner-capacity-reconcile.timer'
    );
    expect(result.events.at(-1)).toBe(
      'systemctl start ci-runner-capacity-reconcile.timer'
    );
    expect(
      result.events.some(event => event.startsWith('systemctl set-property'))
    ).toBe(false);
  });

  it('automatically heals TasksMax drift and reruns the diagnostic', () => {
    const result = runReconciler({ current: '958', maximum: '1024' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('runner_capacity_reconciliation=repaired');
    expect(result.stdout).toContain('runner_tasks_status=ok');
    expect(result.stdout).toContain('runner_tasks_ratio_pct=46');
    expect(result.effectiveMaximum).toBe('2048');
    expect(result.mutations).toBe('TasksMax=2048\n');
  });

  it('clamps an unsafe higher TasksMax to the reviewed ceiling', () => {
    const result = runReconciler({ current: '958', maximum: '4096' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('runner_capacity_reconciliation=repaired');
    expect(result.effectiveMaximum).toBe('2048');
    expect(result.mutations).toBe('TasksMax=2048\n');
  });

  it.each([
    { current: '1700', name: 'warning-level target usage' },
    { current: '3000', name: 'usage above the target ceiling' },
  ])('refuses to lower a higher limit with $name', ({ current }) => {
    const result = runReconciler({ current, maximum: '4096' });

    expect(result.status).toBe(5);
    expect(result.stdout).toContain('runner_capacity_reconciliation=blocked');
    expect(result.stdout).toContain('refusing to lower TasksMax');
    expect(result.effectiveMaximum).toBe('4096');
    expect(result.mutations).toBe('');
  });

  it('leaves an already-correct TasksMax unchanged', () => {
    const result = runReconciler({ current: '958', maximum: '2048' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('runner_capacity_reconciliation=no-op');
    expect(result.stdout).toContain('runner_tasks_status=ok');
    expect(result.effectiveMaximum).toBe('2048');
    expect(result.mutations).toBe('');
  });

  it('fails closed when the live runner cap is not exactly ten', () => {
    const result = runReconciler({
      current: '958',
      maximum: '1024',
      maxRunners: '11',
    });

    expect(result.status).toBe(3);
    expect(result.stdout).toContain('runner_capacity_reconciliation=blocked');
    expect(result.stdout).toContain(
      'live AUTOSCALER_MAX_RUNNERS must be exactly 10; observed 11'
    );
    expect(result.effectiveMaximum).toBe('1024');
    expect(result.mutations).toBe('');
  });

  it('alerts without mutation on genuine saturation at the reviewed ceiling', () => {
    const result = runReconciler({ current: '1700', maximum: '2048' });

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('runner_capacity_reconciliation=no-op');
    expect(result.stdout).toContain('runner_tasks_status=warning');
    expect(result.stdout).toContain('runner_tasks_ratio_pct=83');
    expect(result.effectiveMaximum).toBe('2048');
    expect(result.mutations).toBe('');
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
      diagnoseCiFailure(
        'Caused by: Error: spawn /opt/hostedtoolcache/node/22.23.1/x64/bin/node EAGAIN'
      )
    ).toMatchObject({ failureClass: 'runner_process_exhaustion' });
    expect(
      diagnoseCiFailure('AssertionError: expected 1 to be 2')
    ).toMatchObject({ failureClass: 'unknown' });
  });

  it('classifies proactive slice saturation diagnostics', () => {
    expect(
      diagnoseCiFailure(
        'runner_tasks_status=critical\nrunner_tasks_current=958\nrunner_tasks_max=1024\nrunner_tasks_ratio_pct=93'
      )
    ).toMatchObject({ failureClass: 'runner_slice_task_saturation' });
  });
});
