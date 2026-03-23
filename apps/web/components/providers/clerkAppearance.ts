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
  colorRing: 'rgb(113 112 255 / 0.34)',
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

const authClerkElements = {
  rootBox: {
    width: '100%',
    color: 'var(--color-text-primary-token)',
    colorScheme: 'dark',
  },
  cardBox: {
    width: '100%',
    background: 'transparent',
  },
  card: {
    overflow: 'hidden',
    border: '1px solid var(--color-border-subtle)',
    background:
      'color-mix(in srgb, var(--color-bg-surface-0) 94%, transparent)',
    borderRadius: 'var(--radius-3xl)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.48)',
    backdropFilter: 'blur(24px)',
  },
  headerTitle: {
    color: 'var(--color-text-primary-token)',
    fontSize: 'clamp(1.75rem, 2vw, 1.875rem)',
    fontWeight: 590,
    lineHeight: 1.08,
    letterSpacing: '-0.03em',
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: '0.5rem',
    color: 'var(--color-text-secondary-token)',
    fontSize: '0.9375rem',
    lineHeight: 1.45,
    textAlign: 'center',
  },
  formFieldLabel: {
    marginBottom: '0.25rem',
    color: 'var(--color-text-secondary-token)',
    fontSize: '0.8125rem',
    fontWeight: 510,
    letterSpacing: '-0.012em',
  },
  formFieldInput: {
    minHeight: '44px',
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-input)',
    color: 'var(--color-text-primary-token)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.16)',
    '&::placeholder': {
      color: 'var(--color-text-tertiary-token)',
    },
    '&:focus': {
      borderColor: 'var(--color-border-default)',
      boxShadow: '0 0 0 2px rgba(113, 112, 255, 0.28)',
    },
  },
  formFieldInputShowPasswordButton: {
    color: 'var(--color-text-secondary-token)',
    '&:hover': {
      color: 'var(--color-text-primary-token)',
    },
    '&:focus': {
      boxShadow: '0 0 0 2px rgba(113, 112, 255, 0.28)',
      borderRadius: '0.375rem',
    },
  },
  formButtonPrimary: {
    minHeight: '44px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'var(--color-accent)',
    color: '#ffffff',
    borderRadius: 'var(--radius-pill)',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.32)',
    fontSize: '0.9375rem',
    fontWeight: 590,
    transition:
      'transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease',
    '&:hover': {
      opacity: 0.96,
      transform: 'translateY(-1px)',
    },
  },
  formButtonReset: {
    color: 'var(--color-text-secondary-token)',
    fontSize: '0.8125rem',
    fontWeight: 510,
    '&:hover': {
      color: 'var(--color-text-primary-token)',
    },
  },
  socialButtonsBlockButton: {
    minHeight: '44px',
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-1)',
    color: 'var(--color-text-primary-token)',
    borderRadius: 'var(--radius-xl)',
    transition:
      'background-color 150ms ease, border-color 150ms ease, transform 150ms ease',
    '&:hover': {
      borderColor: 'var(--color-border-default)',
      background: 'var(--color-bg-surface-2)',
      transform: 'translateY(-1px)',
    },
  },
  socialButtonsBlockButtonText: {
    color: 'var(--color-text-primary-token)',
    fontSize: '0.9375rem',
    fontWeight: 510,
  },
  dividerLine: {
    background: 'var(--color-border-subtle)',
  },
  dividerText: {
    color: 'var(--color-text-tertiary-token)',
    fontSize: '0.6875rem',
    fontWeight: 560,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  footer: {
    background: 'transparent',
    paddingTop: '0.5rem',
  },
  footerActionText: {
    color: 'var(--color-text-secondary-token)',
    fontSize: '0.8125rem',
  },
  footerActionLink: {
    color: 'var(--color-text-primary-token)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    '&:hover': {
      opacity: 0.9,
    },
  },
  alert: {
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-1)',
    color: 'var(--color-text-primary-token)',
    borderRadius: 'var(--radius-xl)',
  },
  alertText: {
    color: 'var(--color-text-primary-token)',
  },
  badge: {
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-2)',
    color: 'var(--color-text-secondary-token)',
    borderRadius: '9999px',
  },
  identityPreview: {
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-1)',
    color: 'var(--color-text-primary-token)',
    borderRadius: 'var(--radius-xl)',
  },
  identityPreviewText: {
    color: 'var(--color-text-primary-token)',
  },
  identityPreviewEditButton: {
    color: 'var(--color-text-secondary-token)',
    '&:hover': {
      color: 'var(--color-text-primary-token)',
    },
  },
  otpCodeFieldInput: {
    minHeight: '44px',
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-input)',
    color: 'var(--color-text-primary-token)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.16)',
    '&:focus': {
      borderColor: 'var(--color-border-default)',
      boxShadow: '0 0 0 2px rgba(113, 112, 255, 0.28)',
    },
  },
  modalBackdrop: {
    background: 'rgba(8, 9, 10, 0.72)',
    backdropFilter: 'blur(16px)',
  },
  modalContent: {
    border: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-surface-0)',
    borderRadius: 'var(--radius-3xl)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.48)',
    backdropFilter: 'blur(24px)',
  },
} as const;

export const clerkAppearanceBase = {
  cssLayerName: 'clerk',
  variables: clerkAppearanceVariables,
  elements: clerkBaseElements,
} as const;

export const authClerkAppearance = {
  ...clerkAppearanceBase,
  theme: 'simple',
  options: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
  },
  variables: {
    ...clerkAppearanceVariables,
    colorBackground: 'var(--color-bg-surface-0)',
    colorInput: 'var(--color-bg-input)',
  },
  elements: authClerkElements,
} as const;
