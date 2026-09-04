import { CONFIDENCE_BADGE_LABEL_GAP_CLASS } from '@/features/dashboard/atoms/dashboard-status-badge-semantic-contract';

export const STATUS_BADGE_DRIFT_CLASSES = [
  'raw-palette',
  'blue-hover',
  'clipping-nowrap',
  'geometry-shift',
] as const;

export type StatusBadgeDriftClass = (typeof STATUS_BADGE_DRIFT_CLASSES)[number];

export interface StatusBadgeDriftFinding {
  readonly code: StatusBadgeDriftClass;
}

const GEOMETRY_ALLOWLIST = new Set([CONFIDENCE_BADGE_LABEL_GAP_CLASS]);

const RAW_PALETTE_PATTERN =
  /\b(?:bg|border|text|ring|from|via|to|outline|fill|stroke|decoration)-(?:red|blue|green|yellow|amber|orange|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)(?:-\d{1,3}|\/)/;

const BLUE_HOVER_PATTERN =
  /(?:hover|focus|active|group-hover):(?:bg|text|border|ring)-blue(?:-\d+)?/;

const CLIPPING_NOWRAP_PATTERN =
  /\b(?:overflow-hidden|truncate|text-ellipsis|text-clip|line-clamp-\d+|whitespace-normal)\b/;

const GEOMETRY_PATTERN =
  /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|h|min-h|max-h|w|min-w|gap|space-[xy])-/;

function quotedClassStrings(source: string): readonly string[] {
  return [...source.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

export function auditStatusBadgeSource(
  source: string
): readonly StatusBadgeDriftFinding[] {
  const findings: StatusBadgeDriftFinding[] = [];
  const hasBlueHover = BLUE_HOVER_PATTERN.test(source);
  const sourceWithoutBlueHover = source.replace(
    new RegExp(BLUE_HOVER_PATTERN, 'g'),
    ''
  );

  if (RAW_PALETTE_PATTERN.test(sourceWithoutBlueHover)) {
    findings.push({ code: 'raw-palette' });
  }

  if (hasBlueHover) {
    findings.push({ code: 'blue-hover' });
  }

  if (CLIPPING_NOWRAP_PATTERN.test(source)) {
    findings.push({ code: 'clipping-nowrap' });
  }

  const geometryShift = quotedClassStrings(source).some(
    className =>
      !GEOMETRY_ALLOWLIST.has(className) && GEOMETRY_PATTERN.test(className)
  );
  if (geometryShift) {
    findings.push({ code: 'geometry-shift' });
  }

  return findings;
}

export function codesOf(
  findings: readonly StatusBadgeDriftFinding[]
): readonly StatusBadgeDriftClass[] {
  return findings.map(finding => finding.code);
}
