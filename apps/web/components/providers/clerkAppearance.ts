const clerkAppearanceVariables = {
  colorPrimary: 'var(--color-accent)',
  colorPrimaryForeground: '#ffffff',
  colorForeground: 'var(--color-text-primary-token)',
  colorMutedForeground: 'var(--color-text-secondary-token)',
  colorBackground: 'var(--color-bg-surface-0)',
  colorInput: 'var(--color-bg-surface-0)',
  colorInputForeground: 'var(--color-text-primary-token)',
  colorMuted: 'var(--color-bg-surface-1)',
  colorBorder: 'var(--color-border-subtle)',
  colorShadow: 'rgb(0 0 0 / 0.35)',
  colorDanger: 'var(--linear-error)',
  colorSuccess: 'var(--linear-success)',
  colorRing: 'rgb(113 112 255 / 0.28)',
  colorModalBackdrop: 'rgb(8 9 10 / 0.72)',
  fontFamily: 'var(--font-sans)',
  borderRadius: 'var(--radius-xl)',
} as const;

const authClerkVariables = {
  colorPrimary: '#ffffff',
  colorPrimaryForeground: '#08090a',
  colorForeground: '#ffffff',
  colorMutedForeground: 'rgba(255, 255, 255, 0.64)',
  colorBackground: 'transparent',
  colorInput: 'rgba(255, 255, 255, 0.035)',
  colorInputForeground: '#ffffff',
  colorMuted: 'rgba(255, 255, 255, 0.045)',
  colorBorder: 'rgba(255, 255, 255, 0.08)',
  colorShadow: 'rgb(0 0 0 / 0.42)',
  colorDanger: 'var(--linear-error)',
  colorSuccess: 'var(--linear-success)',
  colorRing: 'rgb(113 112 255 / 0.28)',
  colorModalBackdrop: 'rgb(8 9 10 / 0.72)',
  fontFamily: 'var(--font-sans)',
  borderRadius: 'var(--radius-xl)',
} as const;

/**
 * Legacy Clerk appearance config retained as plain style tokens after the
 * Better Auth cutover. Better Auth has no ClerkProvider, so these are no
 * longer wired into a provider — kept only for the shared auth-surface style
 * reference and existing snapshot tests.
 */
export const clerkAppearanceBase = {
  cssLayerName: 'clerk',
  variables: clerkAppearanceVariables,
  elements: {},
} as const;

export const authClerkAppearance = {
  ...clerkAppearanceBase,
  theme: 'simple',
  variables: authClerkVariables,
} as const;
