import { CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE } from '@/lib/auth/oauth-providers';

/**
 * Legacy auth copy map retained for tests and copy reuse after the Better Auth
 * cutover. The export name is stable while call sites migrate to BA names.
 */
export const authClerkLocalization = {
  socialButtonsBlockButton: CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE,
  socialButtonsBlockButtonManyInView: CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE,
  signIn: {
    start: {
      title: 'Welcome back',
      subtitle: '',
      actionText: 'No account?',
      actionLink: 'Create your account',
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
      title: 'Create your account',
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
