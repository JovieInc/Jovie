import {
  INFOBOX_CONTENT_GEOMETRY_CLASS,
  INFOBOX_SHARED_GEOMETRY_CLASS,
  INFOBOX_TITLE_GEOMETRY_CLASS,
} from '@/components/molecules/info-box-semantic-contract';

export const INFOBOX_DRIFT_CLASSES = [
  'raw-palette',
  'blue-hover',
  'geometry-shift',
] as const;

export type InfoBoxDriftClass = (typeof INFOBOX_DRIFT_CLASSES)[number];

export interface InfoBoxDriftFinding {
  readonly code: InfoBoxDriftClass;
}

const SHARED_GEOMETRY_ALLOWLIST = new Set([
  INFOBOX_SHARED_GEOMETRY_CLASS,
  INFOBOX_TITLE_GEOMETRY_CLASS,
  INFOBOX_CONTENT_GEOMETRY_CLASS,
]);

const RAW_PALETTE_PATTERN =
  /\b(?:bg|border|text|ring|from|via|to|outline|fill|stroke|decoration)-(?:red|blue|green|yellow|amber|orange|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)(?:-\d{1,3}|\/)/;

const BLUE_HOVER_PATTERN =
  /(?:hover|focus|active|group-hover):(?:bg|text|border|ring)-blue(?:-\d+)?/;

const GEOMETRY_PATTERN =
  /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|h|min-h|max-h|w|min-w|gap|space-[xy])-/;

function quotedClassStrings(source: string): readonly string[] {
  return [...source.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

export function auditInfoBoxSource(
  source: string
): readonly InfoBoxDriftFinding[] {
  const findings: InfoBoxDriftFinding[] = [];
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
  findings: readonly InfoBoxDriftFinding[]
): readonly InfoBoxDriftClass[] {
  return findings.map(finding => finding.code);
}
