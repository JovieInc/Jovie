// Ambient type declaration for Clerk on the Window object used in E2E tests
// Ensures TypeScript recognizes window.Clerk methods like signIn/signUp in browser context

declare global {
  interface Window {
    Clerk?: import('@clerk/clerk-js').LoadedClerk;
  }
}

export {};
