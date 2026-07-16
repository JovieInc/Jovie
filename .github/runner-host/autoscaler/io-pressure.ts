export const DEFAULT_IO_FULL_BLOCK_AVG10_PCT = 20;
export const DEFAULT_IO_FULL_RECOVERY_AVG10_PCT = 10;
export const DEFAULT_IO_RECOVERY_SAMPLES = 3;
export const DEFAULT_IO_POST_ADMISSION_TICKS = 3;

export interface IoPressureAdmissionState {
  readonly blocked: boolean;
  readonly recoverySamples: number;
}

export interface IoPressureAdmissionConfig {
  readonly blockAvg10Pct: number;
  readonly recoveryAvg10Pct: number;
  readonly recoverySamples: number;
}

export interface IoPressureAdmissionDecision {
  readonly admitScaleUp: boolean;
  readonly classification:
    | 'runner-io-pressure'
    | 'runner-io-pressure-unavailable'
    | 'runner-io-pressure-recovered'
    | 'runner-io-pressure-ok';
  readonly fullAvg10Pct: number | null;
  readonly state: IoPressureAdmissionState;
  readonly reason: string;
}

export type IoPressureFailureClassification =
  | IoPressureAdmissionDecision['classification']
  | 'runner-io-pressure-post-admission';

export const INITIAL_IO_PRESSURE_STATE: IoPressureAdmissionState = {
  blocked: false,
  recoverySamples: 0,
};

export const DEFAULT_IO_PRESSURE_CONFIG: IoPressureAdmissionConfig = {
  blockAvg10Pct: DEFAULT_IO_FULL_BLOCK_AVG10_PCT,
  recoveryAvg10Pct: DEFAULT_IO_FULL_RECOVERY_AVG10_PCT,
  recoverySamples: DEFAULT_IO_RECOVERY_SAMPLES,
};

function finitePercent(value: string | undefined): number | null {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100
    ? parsed
    : null;
}

export function ioPressureConfigFromEnv(
  env: NodeJS.ProcessEnv
): IoPressureAdmissionConfig {
  const blockAvg10Pct = finitePercent(env.AUTOSCALER_IO_FULL_BLOCK_AVG10_PCT);
  const recoveryAvg10Pct = finitePercent(
    env.AUTOSCALER_IO_FULL_RECOVERY_AVG10_PCT
  );
  const recoverySamples = Number.parseInt(
    env.AUTOSCALER_IO_RECOVERY_SAMPLES ?? '',
    10
  );

  if (
    blockAvg10Pct === null ||
    recoveryAvg10Pct === null ||
    recoveryAvg10Pct >= blockAvg10Pct ||
    !Number.isInteger(recoverySamples) ||
    recoverySamples < 1
  ) {
    return DEFAULT_IO_PRESSURE_CONFIG;
  }

  return { blockAvg10Pct, recoveryAvg10Pct, recoverySamples };
}

export function parseIoFullAvg10(pressure: string): number | null {
  const fullLine = pressure
    .split(/\r?\n/u)
    .find(line => line.trimStart().startsWith('full '));
  const match = fullLine?.match(/(?:^|\s)avg10=([0-9]+(?:\.[0-9]+)?)(?:\s|$)/u);
  if (!match) return null;

  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function classifyIoPressureFailure(
  admission: Pick<
    IoPressureAdmissionDecision,
    'admitScaleUp' | 'classification'
  >,
  currentTick: number,
  lastSuccessfulSpawnTick: number | null,
  postAdmissionTicks = DEFAULT_IO_POST_ADMISSION_TICKS
): IoPressureFailureClassification {
  const ticksSinceLastSpawn =
    lastSuccessfulSpawnTick === null
      ? null
      : currentTick - lastSuccessfulSpawnTick;

  if (
    !admission.admitScaleUp &&
    admission.classification === 'runner-io-pressure' &&
    ticksSinceLastSpawn !== null &&
    ticksSinceLastSpawn > 0 &&
    ticksSinceLastSpawn <= postAdmissionTicks
  ) {
    return 'runner-io-pressure-post-admission';
  }

  return admission.classification;
}

export function evaluateIoPressureAdmission(
  pressure: string | null,
  previous: IoPressureAdmissionState = INITIAL_IO_PRESSURE_STATE,
  config: IoPressureAdmissionConfig = DEFAULT_IO_PRESSURE_CONFIG
): IoPressureAdmissionDecision {
  const fullAvg10Pct = pressure === null ? null : parseIoFullAvg10(pressure);
  if (fullAvg10Pct === null) {
    return {
      admitScaleUp: false,
      classification: 'runner-io-pressure-unavailable',
      fullAvg10Pct: null,
      state: { blocked: true, recoverySamples: 0 },
      reason:
        'I/O pressure is unavailable or malformed; scale-up admission fails closed.',
    };
  }

  if (!previous.blocked && fullAvg10Pct >= config.blockAvg10Pct) {
    return {
      admitScaleUp: false,
      classification: 'runner-io-pressure',
      fullAvg10Pct,
      state: { blocked: true, recoverySamples: 0 },
      reason: `I/O full avg10 ${fullAvg10Pct.toFixed(2)}% reached the ${config.blockAvg10Pct.toFixed(2)}% admission threshold.`,
    };
  }

  if (previous.blocked) {
    const recoverySamples =
      fullAvg10Pct <= config.recoveryAvg10Pct
        ? previous.recoverySamples + 1
        : 0;
    if (recoverySamples >= config.recoverySamples) {
      return {
        admitScaleUp: true,
        classification: 'runner-io-pressure-recovered',
        fullAvg10Pct,
        state: { blocked: false, recoverySamples: 0 },
        reason: `I/O full avg10 stayed at or below ${config.recoveryAvg10Pct.toFixed(2)}% for ${config.recoverySamples} samples.`,
      };
    }

    return {
      admitScaleUp: false,
      classification: 'runner-io-pressure',
      fullAvg10Pct,
      state: { blocked: true, recoverySamples },
      reason: `I/O scale-up admission remains latched; recovery ${recoverySamples}/${config.recoverySamples}.`,
    };
  }

  return {
    admitScaleUp: true,
    classification: 'runner-io-pressure-ok',
    fullAvg10Pct,
    state: INITIAL_IO_PRESSURE_STATE,
    reason: `I/O full avg10 ${fullAvg10Pct.toFixed(2)}% is below the admission threshold.`,
  };
}
