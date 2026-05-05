/**
 * Apple-level auth copy: terse, declarative, no throat-clearing.
 *
 * Per DESIGN.md "Copywriting": say the thing once, earn every word, cut
 * "welcome", "please", "to continue", and other generic setup copy.
 *
 * Applied via `<ClerkProvider localization={...}>` in AuthClientProviders.
 */
export const authClerkLocalization = {
  signIn: {
    start: {
      title: 'Sign in.',
      subtitle: '',
      actionText: 'No account?',
      actionLink: 'Sign up',
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
      title: 'Create your account.',
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
