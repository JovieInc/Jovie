/**
 * Unit tests for the clerk-oauth-options-must-include-prompt ESLint rule.
 *
 * Uses ESLint's RuleTester with flat-config format (ESLint 10+).
 * Wraps RuleTester in explicit describe/it blocks since Vitest runs
 * with globals:false in this project.
 *
 * Tracks: JOV-2396
 */

import { createRequire } from 'node:module';
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

const require = createRequire(import.meta.url);
const rule = require('./clerk-oauth-options-must-include-prompt.js');

// Wire RuleTester to use Vitest's describe/it (needed when globals:false)
RuleTester.describe = /** @type {typeof RuleTester.describe} */ (describe);
RuleTester.it = /** @type {typeof RuleTester.it} */ (it);

// ESLint 10 uses flat config format — use `languageOptions` instead of `parserOptions`
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

// Simulate a file inside app/(auth)/ to trigger the rule
const AUTH_FILENAME = '/home/user/app/(auth)/signin/SignInPageClient.tsx';
// A file outside auth — rule must stay silent
const OUTSIDE_FILENAME = '/home/user/components/features/auth/AuthShell.tsx';

ruleTester.run('clerk-oauth-options-must-include-prompt', rule, {
  valid: [
    // -------------------------------------------------------------------
    // Valid: spread CLERK_COMPONENT_OPTIONS on SignIn
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignIn {...CLERK_COMPONENT_OPTIONS} fallbackRedirectUrl="/" />`,
    },

    // -------------------------------------------------------------------
    // Valid: spread CLERK_COMPONENT_OPTIONS on SignUp
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignUp {...CLERK_COMPONENT_OPTIONS} />`,
    },

    // -------------------------------------------------------------------
    // Valid: explicit oidcPrompt string literal on SignIn
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignIn oidcPrompt="select_account" />`,
    },

    // -------------------------------------------------------------------
    // Valid: explicit oidcPrompt JSX expression on SignUp
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignUp oidcPrompt={'select_account'} />`,
    },

    // -------------------------------------------------------------------
    // Valid: oidcPrompt from CLERK_COMPONENT_OPTIONS.oidcPrompt member access
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignIn oidcPrompt={CLERK_COMPONENT_OPTIONS.oidcPrompt} />`,
    },

    // -------------------------------------------------------------------
    // Valid: outside of app/(auth)/ — rule does NOT apply
    // -------------------------------------------------------------------
    {
      filename: OUTSIDE_FILENAME,
      code: `<SignIn />`,
    },

    // -------------------------------------------------------------------
    // Valid: outside of app/(auth)/ — SignUp without prompt — rule stays silent
    // -------------------------------------------------------------------
    {
      filename: OUTSIDE_FILENAME,
      code: `<SignUp fallbackRedirectUrl="/" />`,
    },

    // -------------------------------------------------------------------
    // Valid: non-Clerk component with the same name elsewhere — not flagged
    // -------------------------------------------------------------------
    {
      filename: OUTSIDE_FILENAME,
      code: `<SignUp />`,
    },

    // -------------------------------------------------------------------
    // Valid: other JSX in auth dir — not SignIn / SignUp
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<Button>Click me</Button>`,
    },
  ],

  invalid: [
    // -------------------------------------------------------------------
    // Invalid: <SignIn> with no oidcPrompt and no spread in auth dir
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignIn fallbackRedirectUrl="/" />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },

    // -------------------------------------------------------------------
    // Invalid: <SignUp> with no oidcPrompt and no spread in auth dir
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignUp fallbackRedirectUrl="/" />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },

    // -------------------------------------------------------------------
    // Invalid: oidcPrompt present but with wrong value
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignIn oidcPrompt="login" />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },

    // -------------------------------------------------------------------
    // Invalid: oidcPrompt present but with wrong value on SignUp
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignUp oidcPrompt="none" />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },

    // -------------------------------------------------------------------
    // Invalid: spreading an object that is NOT CLERK_COMPONENT_OPTIONS
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignIn {...otherOptions} />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },

    // -------------------------------------------------------------------
    // Invalid: spreading SOME_OTHER_OPTIONS (not CLERK_COMPONENT_OPTIONS)
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignUp {...SOME_OTHER_OPTIONS} />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },

    // -------------------------------------------------------------------
    // Invalid: bare <SignIn> with no props at all
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignIn />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },

    // -------------------------------------------------------------------
    // Invalid: bare <SignUp> with no props at all
    // -------------------------------------------------------------------
    {
      filename: AUTH_FILENAME,
      code: `<SignUp />`,
      errors: [{ messageId: 'missingOidcPrompt' }],
    },
  ],
});
