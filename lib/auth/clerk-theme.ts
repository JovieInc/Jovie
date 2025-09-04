import type { Appearance } from '@clerk/nextjs';

/**
 * Centralized Clerk appearance configuration that respects the app's design system.
 * This ensures consistent theming across all Clerk components and proper dark mode support.
 */
export const getClerkAppearance = (): Appearance => ({
  layout: {
    socialButtonsPlacement: 'bottom',
  },
  elements: {
    // Root container
    rootBox: 'bg-transparent',
    
    // Main card container
    card: 'bg-surface-1 border border-subtle shadow-sm rounded-xl p-6',
    
    // Headers
    headerTitle: 'text-xl font-semibold text-primary-token mb-2',
    headerSubtitle: 'text-sm text-secondary-token mb-6',
    
    // Form fields
    formFieldLabel: 'text-sm font-medium text-primary-token mb-2',
    formFieldInput: 
      'w-full px-3 py-2 bg-surface-0 border border-default rounded-lg ' +
      'text-primary-token placeholder:text-tertiary-token ' +
      'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent ' +
      'transition-colors',
    formFieldInputShowPasswordButton: 'text-secondary-token hover:text-primary-token',
    
    // Buttons
    formButtonPrimary: 
      'w-full bg-gray-900 hover:bg-gray-800 active:bg-gray-700 ' +
      'dark:bg-gray-50 dark:hover:bg-gray-200 dark:active:bg-gray-300 ' +
      'text-white dark:text-gray-900 font-medium py-2.5 px-4 rounded-lg ' +
      'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent ' +
      'focus:ring-offset-2 focus:ring-offset-surface-1',
    
    // Social buttons
    socialButtonsBlockButton: 
      'w-full border border-default hover:bg-surface-2 active:bg-surface-3 ' +
      'text-primary-token font-medium py-2.5 px-4 rounded-lg ' +
      'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent ' +
      'focus:ring-offset-2 focus:ring-offset-surface-1',
    socialButtonsBlockButtonText: 'text-primary-token font-medium',
    
    // Divider
    dividerLine: 'bg-border-subtle',
    dividerText: 'text-secondary-token text-sm',
    
    // Footer links
    footerActionText: 'text-secondary-token text-sm',
    footerActionLink: 
      'text-accent-token hover:text-accent-token/80 font-medium ' +
      'transition-colors duration-200 focus:outline-none focus:ring-2 ' +
      'focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-1 rounded',
    
    // Error messages
    formFieldErrorText: 'text-red-600 dark:text-red-400 text-sm mt-1',
    
    // Loading spinner
    spinner: 'text-accent-token',
    
    // Alternative methods
    alternativeMethodsBlockButton: 
      'border border-default hover:bg-surface-2 text-primary-token ' +
      'font-medium py-2 px-3 rounded-lg transition-colors duration-200',
    alternativeMethodsBlockButtonText: 'text-primary-token',
    
    // Form container
    main: 'space-y-4',
    form: 'space-y-4',
    
    // Identity preview
    identityPreview: 'bg-surface-0 border border-subtle rounded-lg p-3',
    identityPreviewText: 'text-primary-token text-sm',
    identityPreviewEditButtonIcon: 'text-secondary-token hover:text-primary-token',
    
    // Verification code input
    otpCodeFieldInput: 
      'w-12 h-12 text-center border border-default rounded-lg ' +
      'bg-surface-0 text-primary-token focus:outline-none focus:ring-2 ' +
      'focus:ring-accent focus:border-accent transition-colors',
      
    // Modal (for user button dropdown)
    modalBackdrop: 'bg-black/50 backdrop-blur-sm',
    modalContent: 
      'bg-surface-1 border border-subtle rounded-xl shadow-lg ' +
      'max-w-md mx-auto mt-20 overflow-hidden',
    
    // User button
    userButtonBox: 'relative',
    userButtonTrigger: 
      'flex items-center space-x-2 p-2 rounded-lg hover:bg-surface-2 ' +
      'transition-colors duration-200 focus:outline-none focus:ring-2 ' +
      'focus:ring-accent focus:ring-offset-2 focus:ring-offset-base',
    userButtonAvatarBox: 'flex-shrink-0',
    userButtonPopoverCard: 
      'bg-surface-1 border border-subtle rounded-xl shadow-lg ' +
      'min-w-64 overflow-hidden',
    userButtonPopoverActionButton: 
      'w-full px-4 py-3 text-left hover:bg-surface-2 text-primary-token ' +
      'transition-colors duration-200 focus:outline-none focus:bg-surface-2',
    userButtonPopoverActionButtonText: 'text-primary-token font-medium',
    userButtonPopoverActionButtonIcon: 'text-secondary-token',
    userButtonPopoverFooter: 'border-t border-subtle px-4 py-3',
  },
  variables: {
    colorPrimary: 'rgb(var(--color-accent, 124 58 237))',
    colorText: 'var(--color-text-primary-token)',
    colorTextSecondary: 'var(--color-text-secondary-token)',
    colorBackground: 'var(--color-bg-surface-1)',
    colorInputBackground: 'var(--color-bg-surface-0)',
    colorInputText: 'var(--color-text-primary-token)',
    borderRadius: '0.75rem', // rounded-xl
    spacingUnit: '1rem',
  },
});

/**
 * Simplified appearance configuration for inline auth components
 * (like those in the current auth pages)
 */
export const getInlineClerkAppearance = (): Appearance => ({
  elements: {
    rootBox: 'mx-auto w-full',
    card: 'shadow-none border-0 bg-transparent p-0',
    
    // Headers - hidden on inline forms as they have their own headers
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    
    // Form fields using design tokens
    formFieldLabel: 'text-sm font-medium text-primary-token mb-2',
    formFieldInput: 
      'w-full px-3 py-2.5 bg-surface-0 border border-default rounded-lg ' +
      'text-primary-token placeholder:text-tertiary-token ' +
      'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent ' +
      'transition-all duration-200',
    
    // Primary button using design system
    formButtonPrimary: 
      'w-full bg-gray-900 hover:bg-gray-800 active:bg-gray-700 ' +
      'dark:bg-gray-50 dark:hover:bg-gray-200 dark:active:bg-gray-300 ' +
      'text-white dark:text-gray-900 font-medium py-3 px-4 rounded-lg ' +
      'transition-all duration-200 focus:outline-none focus:ring-2 ' +
      'focus:ring-accent focus:ring-offset-2 focus:ring-offset-base',
    
    // Social buttons
    socialButtonsBlockButton: 
      'w-full border border-default hover:bg-surface-2 active:bg-surface-3 ' +
      'text-primary-token font-medium py-2.5 px-4 rounded-lg ' +
      'transition-all duration-200 focus:outline-none focus:ring-2 ' +
      'focus:ring-accent focus:ring-offset-2 focus:ring-offset-base',
    socialButtonsBlockButtonText: 'text-primary-token',
    
    // Divider
    dividerLine: 'bg-border-subtle',
    dividerText: 'text-secondary-token text-sm',
    
    // Footer links
    footerActionText: 'text-secondary-token text-sm',
    footerActionLink: 
      'text-accent-token hover:text-accent-token/80 font-medium ' +
      'transition-colors duration-200',
    
    // Error styling
    formFieldErrorText: 'text-red-600 dark:text-red-400 text-sm mt-1',
    
    // Form spacing
    main: 'space-y-4',
    form: 'space-y-4',
  },
  variables: {
    colorPrimary: 'rgb(var(--color-accent, 124 58 237))',
    colorText: 'var(--color-text-primary-token)',
    colorTextSecondary: 'var(--color-text-secondary-token)',
    colorBackground: 'var(--color-bg-base)',
    colorInputBackground: 'var(--color-bg-surface-0)',
    colorInputText: 'var(--color-text-primary-token)',
    borderRadius: '0.75rem',
    spacingUnit: '1rem',
  },
});