/**
 * Explicit auth-shell layout contract (JOV-5490).
 *
 * Each sign-in surface names its expected shell. Editorial card visibility is
 * a viewport rule on the desktop split route only — never an accidental
 * fallback onto modal, handoff, or mobile/tablet.
 */

export const AUTH_SPLIT_MIN_WIDTH_PX = 1024;

export const AUTH_LAYOUT_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

export type AuthLayoutViewportName =
  (typeof AUTH_LAYOUT_VIEWPORTS)[number]['name'];

export const AUTH_SHELL_KIND = {
  desktopSplitRoute: 'desktop-split-route',
  interceptedModal: 'intercepted-modal',
  desktopReturnHandoff: 'desktop-return-handoff',
  stackRoute: 'stack-route',
} as const;

export type AuthShellKind =
  (typeof AUTH_SHELL_KIND)[keyof typeof AUTH_SHELL_KIND];

export type AuthEditorialCardPolicy = 'desktop-only' | 'never';

export const AUTH_SHELL_LAYOUT_CONTRACT = {
  'signin-full-route': {
    shellKind: AUTH_SHELL_KIND.desktopSplitRoute,
    layoutVariant: 'split',
    editorialCard: 'desktop-only',
    owner: 'AuthLayout',
  },
  'signin-intercepted-modal': {
    shellKind: AUTH_SHELL_KIND.interceptedModal,
    layoutVariant: null,
    editorialCard: 'never',
    owner: 'AuthModalShell',
  },
  'desktop-return-handoff': {
    shellKind: AUTH_SHELL_KIND.desktopReturnHandoff,
    layoutVariant: null,
    editorialCard: 'never',
    owner: 'DesktopAuthRouteHandoff',
  },
} as const;

export type AuthShellSurface = keyof typeof AUTH_SHELL_LAYOUT_CONTRACT;

export const AUTH_DESKTOP_ONLY_CLASS = 'auth-desktop-only';
export const AUTH_EDITORIAL_CARD_TEST_ID = 'auth-brand-panel';
export const AUTH_LAYOUT_CSS_RELATIVE_PATH = 'styles/theme.css';
export const AUTH_FORM_CONTAINER_RELATIVE_PATH =
  'components/features/auth/AuthFormContainer.tsx';
export const AUTH_BRANDING_RELATIVE_PATH =
  'components/features/auth/AuthBranding.tsx';

export interface AuthDesktopOnlyCssInspection {
  readonly defaultDisplay: string | null;
  readonly mediaMinWidthPx: number | null;
  readonly mediaDisplay: string | null;
}

export type AuthDesktopOnlyCssIssue =
  | 'default-visible'
  | 'swapped-breakpoint'
  | 'desktop-not-shown'
  | 'missing-default-hide'
  | 'missing-desktop-media';

export type AuthShellHelperKind = 'form-container' | 'branding';

export type AuthShellHelperSourceIssue =
  | 'form-container-owns-shell-padding'
  | 'form-container-owns-form-width'
  | 'branding-owns-breakpoint'
  | 'branding-owns-gradient-shell'
  | 'branding-owns-decorative-orbs'
  | 'branding-bypasses-auth-brand-panel';

function displayOfAuthDesktopOnly(block: string): string | null {
  const match = block.match(/\.auth-desktop-only\s*\{\s*display:\s*([^;}]+)/);
  return match?.[1]?.trim() ?? null;
}

function extractBalancedBlock(source: string, openBraceIndex: number): string {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index);
      }
    }
  }
  return source.slice(openBraceIndex + 1);
}

export function inspectAuthDesktopOnlyCss(
  css: string
): AuthDesktopOnlyCssInspection {
  const mediaPattern = /@media\s*\(\s*min-width:\s*(\d+)px\s*\)/g;
  const mediaRanges: Array<{ readonly start: number; readonly end: number }> =
    [];
  let mediaMatch: RegExpExecArray | null;
  let mediaMinWidthPx: number | null = null;
  let mediaDisplay: string | null = null;

  while ((mediaMatch = mediaPattern.exec(css)) !== null) {
    const braceIndex = css.indexOf('{', mediaMatch.index);
    if (braceIndex < 0) continue;
    const body = extractBalancedBlock(css, braceIndex);
    const end = braceIndex + body.length + 1;
    mediaRanges.push({ start: mediaMatch.index, end });
    const display = displayOfAuthDesktopOnly(body);
    if (display) {
      mediaMinWidthPx = Number.parseInt(mediaMatch[1] ?? '', 10);
      mediaDisplay = display.replace(/\s*!important\s*$/, '').trim();
    }
  }

  const defaultRule = css.match(/\.auth-desktop-only\s*\{[^}]*\}/);
  const defaultIndex = defaultRule ? css.indexOf(defaultRule[0]) : -1;
  const defaultInsideMedia = mediaRanges.some(
    range => defaultIndex >= range.start && defaultIndex <= range.end
  );
  const defaultDisplay =
    defaultRule && !defaultInsideMedia
      ? displayOfAuthDesktopOnly(defaultRule[0])
      : null;

  return {
    defaultDisplay,
    mediaMinWidthPx: Number.isFinite(mediaMinWidthPx) ? mediaMinWidthPx : null,
    mediaDisplay,
  };
}

export function editorialCardVisibleFromCss(
  inspected: AuthDesktopOnlyCssInspection,
  viewportWidth: number
): boolean {
  const display =
    inspected.mediaMinWidthPx != null &&
    viewportWidth >= inspected.mediaMinWidthPx
      ? (inspected.mediaDisplay ?? inspected.defaultDisplay)
      : inspected.defaultDisplay;
  return Boolean(display && display !== 'none');
}

export function authDesktopOnlyCssIssues(
  inspected: AuthDesktopOnlyCssInspection
): readonly AuthDesktopOnlyCssIssue[] {
  const issues: AuthDesktopOnlyCssIssue[] = [];
  if (inspected.defaultDisplay == null) {
    issues.push('missing-default-hide');
  } else if (inspected.defaultDisplay !== 'none') {
    issues.push('default-visible');
  }
  if (inspected.mediaMinWidthPx == null || inspected.mediaDisplay == null) {
    issues.push('missing-desktop-media');
    return issues;
  }
  if (inspected.mediaMinWidthPx !== AUTH_SPLIT_MIN_WIDTH_PX) {
    issues.push('swapped-breakpoint');
  }
  if (inspected.mediaDisplay !== 'block') {
    issues.push('desktop-not-shown');
  }
  return issues;
}

export function editorialCardExpectedVisible(
  surface: AuthShellSurface,
  viewportWidth: number
): boolean {
  const policy = AUTH_SHELL_LAYOUT_CONTRACT[surface].editorialCard;
  if (policy === 'never') return false;
  return viewportWidth >= AUTH_SPLIT_MIN_WIDTH_PX;
}

export function inspectAuthLayoutSourceIssues(
  source: string
): readonly string[] {
  const issues: string[] = [];
  if (!source.includes(AUTH_DESKTOP_ONLY_CLASS)) {
    issues.push('missing-desktop-only-class');
  }
  if (!source.includes('lg:grid-cols-')) {
    issues.push('missing-lg-split-grid');
  }
  if (source.includes('md:grid-cols-') || source.includes('sm:grid-cols-')) {
    issues.push('swapped-grid-breakpoint');
  }
  if (
    source.includes('<AuthBrandPanel') &&
    !source.includes(AUTH_DESKTOP_ONLY_CLASS)
  ) {
    issues.push('editorial-unwrapped');
  }
  return issues;
}

export function inspectAuthShellHelperSourceIssues(
  helper: AuthShellHelperKind,
  source: string
): readonly AuthShellHelperSourceIssue[] {
  const issues: AuthShellHelperSourceIssue[] = [];

  if (helper === 'form-container') {
    if (
      /\b(?:sm:|md:|lg:|xl:)?px-\d+\b/.test(source) ||
      source.includes('safe-area-inset')
    ) {
      issues.push('form-container-owns-shell-padding');
    }

    if (
      source.includes('AUTH_FORM_MAX_WIDTH_CLASS') ||
      /\b(?:sm:|md:|lg:|xl:)?max-w-/.test(source)
    ) {
      issues.push('form-container-owns-form-width');
    }

    return issues;
  }

  if (/\b(?:sm|md|lg|xl):(?:block|flex|grid|hidden)\b/.test(source)) {
    issues.push('branding-owns-breakpoint');
  }

  if (
    source.includes('gradientVariants') ||
    source.includes('bg-gradient-to-') ||
    source.includes('bg-linear-to-')
  ) {
    issues.push('branding-owns-gradient-shell');
  }

  if (
    source.includes('rounded-full') ||
    source.includes('blur-xl') ||
    source.includes('blur-3xl') ||
    source.includes('animate-pulse')
  ) {
    issues.push('branding-owns-decorative-orbs');
  }

  if (!source.includes('AuthBrandPanel')) {
    issues.push('branding-bypasses-auth-brand-panel');
  }

  return issues;
}
