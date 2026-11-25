export const SPARKLINE_WIDTH = 340;
export const SPARKLINE_HEIGHT = 120;

export function isMeasurement(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

type Point = { index: number; value: number };

type Column = {
  first: Point;
  last: Point;
  min: Point;
  max: Point;
};

function appendColumn(segment: Point[], column: Column) {
  const { first, min, max, last } = column;
  segment.push(first);
  const extrema = min.index < max.index ? [min, max] : [max, min];
  for (const point of extrema) {
    if (point.index > first.index && point.index < last.index) {
      segment.push(point);
    }
  }
  if (last.index !== first.index) segment.push(last);
}

function summarize(points: readonly (number | null)[]) {
  let measured = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  let runs = 0;
  let inRun = false;
  for (const value of points) {
    if (isMeasurement(value)) {
      measured++;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      if (!inRun) runs++;
      inRun = true;
    } else {
      inRun = false;
    }
  }
  return { measured, minimum, maximum, runs };
}

function sample(
  points: readonly (number | null)[],
  xFor: (index: number) => number,
  dotsOnly: boolean
) {
  const segments: Point[][] = [];
  let segment: Point[] = [];
  let column: Column | undefined;
  let columnIndex = -1;

  function finishSegment() {
    if (column) {
      appendColumn(segment, column);
      segments.push(segment);
      segment = [];
      column = undefined;
    }
  }

  for (let index = 0; index < points.length; index++) {
    const value = points[index];
    if (!isMeasurement(value)) {
      if (!dotsOnly) finishSegment();
      continue;
    }
    const point = { index, value };
    const pixel = Math.floor(xFor(index));
    if (column && pixel === columnIndex) {
      column.last = point;
      if (value < column.min.value) column.min = point;
      if (value > column.max.value) column.max = point;
    } else {
      if (column) appendColumn(segment, column);
      columnIndex = pixel;
      column = { first: point, last: point, min: point, max: point };
    }
  }
  finishSegment();
  return segments;
}

/**
 * Preserve each column's observed endpoints and extrema in temporal order.
 * If disconnected runs outnumber the chart columns, draw independent samples.
 */
export function sparklineGeometry(
  points: readonly (number | null)[],
  variant: 'area' | 'pulse'
) {
  const { measured, minimum, maximum, runs } = summarize(points);
  const dotsOnly = runs > SPARKLINE_WIDTH;
  const xFor = (index: number) =>
    points.length <= 1
      ? SPARKLINE_WIDTH / 2
      : (index / (points.length - 1)) * SPARKLINE_WIDTH;
  const segments = sample(points, xFor, dotsOnly);
  const low = Math.min(minimum, 0);
  const high = Math.max(maximum, 1);
  // Opposite, finite values near Number.MAX_VALUE can have an infinite span.
  const scale = Number.isFinite(high - low) ? 1 : 0.5;
  const span = high * scale - low * scale;
  const padding = variant === 'pulse' ? SPARKLINE_HEIGHT * 0.18 : 0;
  const yFor = (value: number) =>
    SPARKLINE_HEIGHT -
    padding -
    ((value * scale - low * scale) / span) * (SPARKLINE_HEIGHT - 2 * padding);

  const lines: string[] = [];
  const areas: string[] = [];
  const baseline = yFor(0).toFixed(1);
  for (const run of segments) {
    const isolated = dotsOnly || run.length === 1;
    const path = run
      .map((point, index) => {
        const xy = `${xFor(point.index).toFixed(1)} ${yFor(point.value).toFixed(1)}`;
        // A zero-length line with a round cap paints a measured point.
        if (isolated) return `M ${xy} l 0 0`;
        return `${index === 0 ? 'M' : 'L'} ${xy}`;
      })
      .join(' ');
    lines.push(path);
    if (variant === 'area' && !isolated) {
      const start = xFor(run[0].index).toFixed(1);
      const end = xFor(run[run.length - 1].index).toFixed(1);
      areas.push(`${path} L ${end} ${baseline} L ${start} ${baseline} Z`);
    }
  }

  const sampledCount = segments.reduce((count, run) => count + run.length, 0);
  let samplingNote = '';
  if (dotsOnly) {
    samplingNote =
      'Dots show sampled observations, including local lows and highs.';
  } else if (sampledCount < measured) {
    samplingNote =
      'The line shows sampled observations, including local lows and highs.';
  }
  const missing = points.length - measured;
  const description =
    measured === 0
      ? `No measurements. ${missing} missing.`
      : `${measured} measured, ${missing} missing. Minimum ${minimum}, maximum ${maximum}.`;
  return {
    path: lines.join(' '),
    fillPath: areas.join(' '),
    description: samplingNote ? `${description} ${samplingNote}` : description,
    samplingNote,
    xFor,
    yFor,
  };
}
