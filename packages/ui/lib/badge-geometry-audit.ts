import {
  BADGE_SHARED_GEOMETRY_CLASS,
  BADGE_SIZE_GEOMETRY,
} from './badge-geometry-contract';

export const BADGE_DRIFT_CLASSES = [
  'label-overflow',
  'blue-hover',
  'geometry-shift',
] as const;

export type BadgeDriftClass = (typeof BADGE_DRIFT_CLASSES)[number];

export interface BadgeDriftFinding {
  readonly code: BadgeDriftClass;
}

const SHARED_GEOMETRY_ALLOWLIST = new Set<string>([
  BADGE_SHARED_GEOMETRY_CLASS,
  ...Object.values(BADGE_SIZE_GEOMETRY),
]);

const LABEL_OVERFLOW_PATTERN =
  /\b(?:whitespace-nowrap|overflow-hidden|truncate|line-clamp-\d+)\b/;

const BLUE_HOVER_PATTERN =
  /(?:hover|focus|active|group-hover):(?:bg|text|border|ring)-blue(?:-\d+)?/;

const GEOMETRY_PATTERN =
  /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|h|min-h|max-h|w|min-w|gap|space-[xy]|rounded)-/;

function quotedClassStrings(source: string): readonly string[] {
  return [...source.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

export function auditBadgeSource(source: string): readonly BadgeDriftFinding[] {
  const findings: BadgeDriftFinding[] = [];
  const hasBlueHover = BLUE_HOVER_PATTERN.test(source);
  const sourceWithoutBlueHover = source.replace(
    new RegExp(BLUE_HOVER_PATTERN, 'g'),
    ''
  );

  if (LABEL_OVERFLOW_PATTERN.test(sourceWithoutBlueHover)) {
    findings.push({ code: 'label-overflow' });
  }

  if (hasBlueHover) {
    findings.push({ code: 'blue-hover' });
  }

  const geometryShift = quotedClassStrings(source).some(
    className =>
      !SHARED_GEOMETRY_ALLOWLIST.has(className) &&
      GEOMETRY_PATTERN.test(className)
  );
  if (geometryShift) {
    findings.push({ code: 'geometry-shift' });
  }

  return findings;
}

export function codesOf(
  findings: readonly BadgeDriftFinding[]
): readonly BadgeDriftClass[] {
  return findings.map(finding => finding.code);
}
