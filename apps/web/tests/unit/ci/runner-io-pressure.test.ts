import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IO_PRESSURE_CONFIG,
  evaluateIoPressureAdmission,
  INITIAL_IO_PRESSURE_STATE,
  ioPressureConfigFromEnv,
  parseIoFullAvg10,
} from '../../../../../.github/runner-host/autoscaler/io-pressure';
import { diagnoseCiFailure } from '../../../../../scripts/hermes/jobs/ci-failure-diagnosis';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const pressure = (fullAvg10: string) =>
  `some avg10=31.00 avg60=12.00 avg300=4.00 total=1\nfull avg10=${fullAvg10} avg60=8.00 avg300=2.00 total=2\n`;

describe('Gem runner I/O-pressure admission', () => {
  it('parses Linux full pressure without confusing it with some pressure', () => {
    expect(parseIoFullAvg10(pressure('19.75'))).toBe(19.75);
    expect(parseIoFullAvg10('some avg10=99.00 total=1\n')).toBe(null);
  });

  it('blocks only scale-up at the measured 20% full avg10 threshold', () => {
    expect(
      evaluateIoPressureAdmission(pressure('19.99'), INITIAL_IO_PRESSURE_STATE)
    ).toMatchObject({
      admitScaleUp: true,
      classification: 'runner-io-pressure-ok',
    });
    expect(
      evaluateIoPressureAdmission(pressure('20.00'), INITIAL_IO_PRESSURE_STATE)
    ).toMatchObject({
      admitScaleUp: false,
      classification: 'runner-io-pressure',
      state: { blocked: true, recoverySamples: 0 },
    });
  });

  it('requires three low-pressure samples before reopening admission', () => {
    const blocked = evaluateIoPressureAdmission(
      pressure('29.00'),
      INITIAL_IO_PRESSURE_STATE
    );
    const midBand = evaluateIoPressureAdmission(
      pressure('15.00'),
      blocked.state
    );
    const recovery1 = evaluateIoPressureAdmission(
      pressure('10.00'),
      midBand.state
    );
    const recovery2 = evaluateIoPressureAdmission(
      pressure('9.00'),
      recovery1.state
    );
    const recovered = evaluateIoPressureAdmission(
      pressure('8.00'),
      recovery2.state
    );

    expect(midBand).toMatchObject({
      admitScaleUp: false,
      state: { blocked: true, recoverySamples: 0 },
    });
    expect(recovery1.admitScaleUp).toBe(false);
    expect(recovery2.admitScaleUp).toBe(false);
    expect(recovered).toMatchObject({
      admitScaleUp: true,
      classification: 'runner-io-pressure-recovered',
      state: { blocked: false, recoverySamples: 0 },
    });
  });

  it('fails scale-up admission closed when PSI is unavailable', () => {
    expect(evaluateIoPressureAdmission(null)).toMatchObject({
      admitScaleUp: false,
      classification: 'runner-io-pressure-unavailable',
      fullAvg10Pct: null,
    });
    expect(evaluateIoPressureAdmission('malformed')).toMatchObject({
      admitScaleUp: false,
      classification: 'runner-io-pressure-unavailable',
    });
  });

  it('accepts a valid tuned hysteresis and rejects unsafe configuration', () => {
    expect(
      ioPressureConfigFromEnv({
        AUTOSCALER_IO_FULL_BLOCK_AVG10_PCT: '25',
        AUTOSCALER_IO_FULL_RECOVERY_AVG10_PCT: '12',
        AUTOSCALER_IO_RECOVERY_SAMPLES: '4',
      })
    ).toEqual({
      blockAvg10Pct: 25,
      recoveryAvg10Pct: 12,
      recoverySamples: 4,
    });
    expect(
      ioPressureConfigFromEnv({
        AUTOSCALER_IO_FULL_BLOCK_AVG10_PCT: '10',
        AUTOSCALER_IO_FULL_RECOVERY_AVG10_PCT: '20',
        AUTOSCALER_IO_RECOVERY_SAMPLES: '0',
      })
    ).toBe(DEFAULT_IO_PRESSURE_CONFIG);
  });

  it('wires admission before spawn without adding a runner mutation path', () => {
    const controllerPatch = readFileSync(
      resolve(
        repoRoot,
        '.github/runner-host/autoscaler/controller-io-pressure.patch'
      ),
      'utf8'
    );
    const admissionStart = controllerPatch.indexOf(
      'evaluateIoPressureAdmission('
    );

    expect(admissionStart).toBeGreaterThan(0);
    expect(controllerPatch).toContain('admittedDeficit = 0');
    expect(controllerPatch).toContain(
      'runner_spawn_admission=blocked runner_failure_class='
    );
    expect(controllerPatch).not.toContain(
      '+            this.docker.stopContainer'
    );
    expect(controllerPatch).not.toContain('+            this.gh.removeRunner');
    expect(controllerPatch).not.toContain('gh run');
  });

  it('keeps installation dry-run-only by default and preserves ten runners', () => {
    const installer = resolve(
      repoRoot,
      '.github/runner-host/install-io-pressure-guard.sh'
    );
    const result = spawnSync('bash', [installer], { encoding: 'utf8' });
    const source = readFileSync(installer, 'utf8');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Dry run: no host state changed.');
    expect(result.stdout).toContain('max runners at 10');
    expect(source).not.toMatch(/systemctl (?:re)?start/u);
    expect(source).not.toContain('docker stop');
    expect(source).not.toContain('gh run cancel');
  });

  it('classifies I/O admission separately from EAGAIN capacity', () => {
    expect(
      diagnoseCiFailure(
        'runner_spawn_admission=blocked runner_failure_class=runner-io-pressure io_full_avg10_pct=29.00 distinct_from=cpu,memory,eagain,github-scheduler-starvation'
      )
    ).toMatchObject({ failureClass: 'runner_io_pressure_admission' });
    expect(diagnoseCiFailure('spawn /usr/bin/node EAGAIN')).toMatchObject({
      failureClass: 'runner_process_exhaustion',
    });
  });
});
