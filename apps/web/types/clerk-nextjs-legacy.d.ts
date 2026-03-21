declare module '@clerk/nextjs/legacy' {
  import type { UseSignInReturn, UseSignUpReturn } from '@clerk/shared/types';

  export function useSignIn(): UseSignInReturn;
  export function useSignUp(): UseSignUpReturn;
}
