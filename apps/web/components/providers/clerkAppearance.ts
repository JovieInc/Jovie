type ClerkAppearance = NonNullable<
  Parameters<typeof import('@clerk/nextjs').ClerkProvider>[0]['appearance']
>;

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

const clerkBaseElements = {
  rootBox: 'bg-base text-primary-token',
  card: 'bg-surface-0 border border-subtle shadow-sm dark:shadow-lg dark:shadow-black/20',
  cardBox: 'bg-surface-0',
  headerTitle: 'text-primary-token font-semibold',
  headerSubtitle: 'text-secondary-token',
  formFieldLabel: 'text-primary-token font-medium',
  formFieldInput:
    'bg-surface-0 border border-subtle text-primary-token placeholder:text-tertiary-token focus-ring-themed rounded-lg transition-colors',
  formFieldInputShowPasswordButton:
    'text-secondary-token hover:text-primary-token',
  formFieldErrorText: 'text-destructive',
  formFieldSuccessText: 'text-green-600 dark:text-green-400',
  formButtonPrimary:
    'btn btn-primary btn-md rounded-xl shadow-sm hover:opacity-90 transition-all',
  formButtonReset: 'text-secondary-token hover:text-primary-token',
  socialButtonsBlockButton:
    'btn btn-secondary btn-md border border-subtle hover:bg-surface-1 transition-colors',
  socialButtonsBlockButtonText: 'text-primary-token',
  socialButtonsProviderIcon: 'w-5 h-5',
  dividerLine: 'bg-subtle',
  dividerText: 'text-tertiary-token',
  footer: 'bg-transparent',
  footerActionText: 'text-secondary-token',
  footerActionLink: 'text-accent-token hover:underline',
  alert: 'bg-surface-1 border border-subtle text-primary-token',
  alertText: 'text-primary-token',
  badge: 'bg-surface-2 text-secondary-token',
  avatarBox: 'border-2 border-subtle',
  identityPreview: 'bg-surface-1 border border-subtle',
  identityPreviewText: 'text-primary-token',
  identityPreviewEditButton: 'text-secondary-token hover:text-primary-token',
  otpCodeFieldInput:
    'bg-surface-0 border border-subtle text-primary-token focus-visible:border-default focus-visible:ring-2 focus-visible:ring-[rgb(113_112_255_/_0.28)]',
  modalBackdrop: 'bg-black/50 dark:bg-black/70 backdrop-blur-sm',
  modalContent: 'bg-surface-0 border border-subtle shadow-xl',
} as const;

/*
 * Auth page element overrides — structural/layout only.
 * Visual styling (colors, shadows, typography, states) lives in theme.css
 * targeting .cl-signIn-root / .cl-signUp-root selectors.
 */
const authClerkElements = {
  rootBox: {
    width: '100%',
    background: 'transparent',
  },
  cardBox: {
    width: '100%',
    background: 'transparent',
    boxShadow: 'none',
  },
  card: {
    overflow: 'visible',
    background: 'transparent',
    border: '0',
    boxShadow: 'none',
    borderRadius: '0',
  },
} as const;

export const clerkAppearanceBase = {
  cssLayerName: 'clerk',
  variables: clerkAppearanceVariables,
  elements: clerkBaseElements,
} satisfies ClerkAppearance;

/*
 * Auth pages always render on a dark background (hardcoded gradient overlay).
 * Use fixed dark-theme values so Clerk components display correctly regardless
 * of the user's system light/dark mode. CSS custom properties in theme.css
 * (--clerk-color-*) provide the same values for element-level overrides.
 */
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

export const authClerkAppearance = {
  ...clerkAppearanceBase,
  theme: 'simple',
  options: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
  },
  variables: authClerkVariables,
  elements: authClerkElements,
} satisfies ClerkAppearance;
