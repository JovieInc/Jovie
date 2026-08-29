import {
  ERROR_BANNER_ACTION_LAYOUT_CLASS,
  ERROR_BANNER_ACTIONS_ROW_CLASS,
  ERROR_BANNER_BODY_CLASS,
  ERROR_BANNER_COPY_ICON_CLASS,
  ERROR_BANNER_DESCRIPTION_CLASS,
  ERROR_BANNER_DETAILS_META_CLASS,
  ERROR_BANNER_DETAILS_PANEL_CLASS,
  ERROR_BANNER_DETAILS_TOGGLE_CLASS,
  ERROR_BANNER_DETAILS_WRAP_CLASS,
  ERROR_BANNER_DEV_PANEL_CLASS,
  ERROR_BANNER_DEV_PRE_CLASS,
  ERROR_BANNER_DEV_SUMMARY_CLASS,
  ERROR_BANNER_DISMISS_ICON_CLASS,
  ERROR_BANNER_DISMISS_LAYOUT_CLASS,
  ERROR_BANNER_ICON_CLASS,
  ERROR_BANNER_ICON_WRAP_CLASS,
  ERROR_BANNER_ROW_CLASS,
  ERROR_BANNER_SHELL_GEOMETRY_CLASS,
  ERROR_BANNER_SHELL_SEMANTIC_CLASS,
  ERROR_BANNER_TITLE_CLASS,
} from '@/features/feedback/error-banner-semantic-contract';

export const ERROR_BANNER_DRIFT_CLASSES = [
  'raw-palette',
  'undersized-target',
  'geometry-shift',
] as const;

export type ErrorBannerDriftClass = (typeof ERROR_BANNER_DRIFT_CLASSES)[number];

export interface ErrorBannerDriftFinding {
  readonly code: ErrorBannerDriftClass;
}

const SHARED_GEOMETRY_ALLOWLIST = new Set([
  ERROR_BANNER_SHELL_GEOMETRY_CLASS,
  ERROR_BANNER_SHELL_SEMANTIC_CLASS,
  ERROR_BANNER_ROW_CLASS,
  ERROR_BANNER_ICON_WRAP_CLASS,
  ERROR_BANNER_ICON_CLASS,
  ERROR_BANNER_BODY_CLASS,
  ERROR_BANNER_TITLE_CLASS,
  ERROR_BANNER_DESCRIPTION_CLASS,
  ERROR_BANNER_ACTIONS_ROW_CLASS,
  ERROR_BANNER_ACTION_LAYOUT_CLASS,
  ERROR_BANNER_DETAILS_WRAP_CLASS,
  ERROR_BANNER_DETAILS_TOGGLE_CLASS,
  ERROR_BANNER_DETAILS_PANEL_CLASS,
  ERROR_BANNER_DETAILS_META_CLASS,
  ERROR_BANNER_DEV_PANEL_CLASS,
  ERROR_BANNER_DEV_SUMMARY_CLASS,
  ERROR_BANNER_DEV_PRE_CLASS,
  ERROR_BANNER_DISMISS_LAYOUT_CLASS,
  ERROR_BANNER_COPY_ICON_CLASS,
  ERROR_BANNER_DISMISS_ICON_CLASS,
]);

const RAW_PALETTE_PATTERN =
  /\b(?:bg|border|text|ring|from|via|to|outline|fill|stroke|decoration|ring-offset)-(?:red|blue|green|yellow|amber|orange|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|black|white)(?:-\d{1,3}|\/)/;

const UNDERSIZED_TARGET_PATTERN =
  /\b(?:h-auto|p-1\.5|py-1(?!\.)|px-2(?!\.)|before:hidden|rounded-md)\b/;

const GEOMETRY_PATTERN =
  /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|h|min-h|max-h|w|min-w|gap|space-[xy]|rounded)-/;

function quotedClassStrings(source: string): readonly string[] {
  return [...source.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

export function auditErrorBannerSource(
  source: string
): readonly ErrorBannerDriftFinding[] {
  const findings: ErrorBannerDriftFinding[] = [];
  const hasUndersizedTarget = UNDERSIZED_TARGET_PATTERN.test(source);
  const sourceWithoutUndersized = source.replace(
    new RegExp(UNDERSIZED_TARGET_PATTERN, 'g'),
    ''
  );

  if (RAW_PALETTE_PATTERN.test(sourceWithoutUndersized)) {
    findings.push({ code: 'raw-palette' });
  }

  if (hasUndersizedTarget) {
    findings.push({ code: 'undersized-target' });
  }

  const geometryShift = quotedClassStrings(source).some(
    className =>
      !UNDERSIZED_TARGET_PATTERN.test(className) &&
      !SHARED_GEOMETRY_ALLOWLIST.has(className) &&
      GEOMETRY_PATTERN.test(className)
  );
  if (geometryShift) {
    findings.push({ code: 'geometry-shift' });
  }

  return findings;
}

export function codesOf(
  findings: readonly ErrorBannerDriftFinding[]
): readonly ErrorBannerDriftClass[] {
  return findings.map(finding => finding.code);
}
