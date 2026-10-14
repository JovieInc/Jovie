/** Rendered contract for glyph decoration, independent of semantic badges. */
export interface IconGlyphMeasurement {
  readonly state: 'idle' | 'hover' | 'focus';
  readonly width: number;
  readonly height: number;
  readonly backgroundAlpha: number;
  readonly cornerRadii: readonly number[];
}

export function evaluateIconGlyphContract(
  sample: IconGlyphMeasurement
): string[] {
  const values = [
    sample.width,
    sample.height,
    sample.backgroundAlpha,
    ...sample.cornerRadii,
  ];
  if (
    values.some(value => !Number.isFinite(value)) ||
    sample.width <= 0 ||
    sample.height <= 0 ||
    sample.cornerRadii.length !== 4 ||
    sample.backgroundAlpha < 0 ||
    sample.backgroundAlpha > 1
  )
    return ['invalid glyph measurement'];
  if (sample.state !== 'hover' && sample.backgroundAlpha > 0)
    return ['glyph background persists outside hover'];
  if (
    sample.state === 'hover' &&
    sample.backgroundAlpha > 0 &&
    (Math.abs(sample.width - sample.height) > 0.5 ||
      sample.cornerRadii.some(
        radius => radius < Math.min(sample.width, sample.height) / 2
      ))
  )
    return ['hover background is not circular'];
  return [];
}
