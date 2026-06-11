export const VISUAL_QA_COLOR_SCHEMES = ['dark', 'light'] as const;

export type VisualQaColorScheme = (typeof VISUAL_QA_COLOR_SCHEMES)[number];

export type VisualQaThemeRequest = VisualQaColorScheme | 'both';

export function isVisualQaColorScheme(
  value: string
): value is VisualQaColorScheme {
  return (VISUAL_QA_COLOR_SCHEMES as readonly string[]).includes(value);
}

export function resolveVisualQaColorSchemes(
  theme: VisualQaThemeRequest
): readonly VisualQaColorScheme[] {
  return theme === 'both' ? [...VISUAL_QA_COLOR_SCHEMES] : [theme];
}

export function parseVisualQaThemeToken(value: string): VisualQaThemeRequest {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'both') {
    return 'both';
  }

  if (isVisualQaColorScheme(normalized)) {
    return normalized;
  }

  throw new Error(
    `Invalid Visual QA theme "${value}". Expected dark, light, or both.`
  );
}

export function resolveVisualQaCaptureColorScheme(
  surfaceDefault: VisualQaColorScheme | undefined,
  requestedTheme: VisualQaColorScheme
): VisualQaColorScheme {
  return surfaceDefault ?? requestedTheme;
}
