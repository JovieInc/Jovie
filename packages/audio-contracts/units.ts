declare const audioUnitBrand: unique symbol;

export type Milliseconds = number & {
  readonly [audioUnitBrand]: 'milliseconds';
};
export type Seconds = number & { readonly [audioUnitBrand]: 'seconds' };
export type Percent = number & { readonly [audioUnitBrand]: 'percent' };
export type Bpm = number & { readonly [audioUnitBrand]: 'bpm' };
export type AnalysisConfidence = number & {
  readonly [audioUnitBrand]: 'analysis-confidence';
};

function requireFiniteNonNegative(value: number, unit: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${unit} must be a finite, non-negative number`);
  }
  return value;
}

export function milliseconds(value: number): Milliseconds {
  return requireFiniteNonNegative(value, 'milliseconds') as Milliseconds;
}

export function seconds(value: number): Seconds {
  return requireFiniteNonNegative(value, 'seconds') as Seconds;
}

export function percent(value: number): Percent {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError('percent must be between 0 and 100');
  }
  return value as Percent;
}

export function bpm(value: number): Bpm {
  if (!Number.isFinite(value) || value <= 0 || value > 400) {
    throw new RangeError('bpm must be greater than 0 and at most 400');
  }
  return value as Bpm;
}

export function analysisConfidence(value: number): AnalysisConfidence {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('analysis confidence must be between 0 and 1');
  }
  return value as AnalysisConfidence;
}

export function millisecondsToSeconds(value: Milliseconds): Seconds {
  return seconds(value / 1000);
}

export function secondsToMilliseconds(value: Seconds): Milliseconds {
  return milliseconds(value * 1000);
}
