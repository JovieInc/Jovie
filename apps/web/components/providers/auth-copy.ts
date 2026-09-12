import { CLERK_SOCIAL_BUTTON_LABEL_TEMPLATE } from '@/lib/auth/oauth-providers';

/**
 * First-party auth copy map used by the front-door contract test and any
 * leftover copy reuse. Better Auth owns the live form; this is not a vendor
 * localization object.
 */
export const authCopy = {
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
