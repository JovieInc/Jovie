import { CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE } from '@/lib/auth/oauth-providers';

/**
 * Apple-level auth copy: terse, declarative, no throat-clearing.
 *
 * Per DESIGN.md "Copywriting": say the thing once, earn every word, cut
 * "welcome", "please", "to continue", and other generic setup copy.
 *
 * Applied via `<ClerkProvider localization={...}>` in AuthClientProviders.
 */
export const authClerkLocalization = {
  socialButtonsBlockButton: CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE,
  socialButtonsBlockButtonManyInView: CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE,
  signIn: {
    start: {
      title: 'Welcome back',
      subtitle: '',
      actionText: 'No account?',
      actionLink: 'Request access',
    },
    password: {
      title: 'Enter your password.',
      subtitle: '',
    },
    forgotPassword: {
      title: 'Reset your password.',
      subtitle: '',
    },
    forgotPasswordAlternativeMethods: {
      title: 'Reset your password.',
    },
    emailCode: {
      title: 'Check your email.',
      subtitle: '',
    },
    emailLink: {
      title: 'Check your email.',
      subtitle: '',
    },
  },
  signUp: {
    start: {
      title: 'Request access',
      subtitle: '',
      actionText: 'Have an account?',
      actionLink: 'Sign in',
    },
    emailCode: {
      title: 'Verify your email.',
      subtitle: '',
    },
    emailLink: {
      title: 'Verify your email.',
      subtitle: '',
    },
  },
} as const;
