/**
 * ESLint rule: clerk-oauth-options-must-include-prompt
 *
 * Asserts that every `<SignIn>` and `<SignUp>` JSX element in
 * `apps/web/app/(auth)/**` either:
 *   (a) spreads `CLERK_COMPONENT_OPTIONS` (from `@/lib/auth/clerk-options`), OR
 *   (b) passes `oidcPrompt='select_account'` (or `oidcPrompt={"select_account"}`)
 *       explicitly as a prop.
 *
 * Without this, the OAuth provider may silently reuse the last session and
 * bypass the account chooser — allowing silent account switching.
 *
 * Audit findings: JOV-2394 #85, #86 (JOV-2182)
 * Tracks: JOV-2396
 *
 * Fix: spread CLERK_COMPONENT_OPTIONS from `@/lib/auth/clerk-options`:
 *   import { CLERK_COMPONENT_OPTIONS } from '@/lib/auth/clerk-options';
 *   <SignIn {...CLERK_COMPONENT_OPTIONS} ... />
 */

'use strict';

/**
 * Returns true if the JSX opening element has a spread attribute that
 * references CLERK_COMPONENT_OPTIONS (e.g. `{...CLERK_COMPONENT_OPTIONS}`).
 *
 * @param {import('eslint').Rule.RuleContext} _context
 * @param {import('@typescript-eslint/types').TSESTree.JSXOpeningElement} node
 */
function hasClerkOptionSpread(node) {
  return node.attributes.some(
    attr =>
      attr.type === 'JSXSpreadAttribute' &&
      attr.argument.type === 'Identifier' &&
      attr.argument.name === 'CLERK_COMPONENT_OPTIONS'
  );
}

/**
 * Returns true if the JSX opening element has an explicit `oidcPrompt` prop
 * set to the string value 'select_account'.
 *
 * @param {import('@typescript-eslint/types').TSESTree.JSXOpeningElement} node
 */
function hasExplicitOidcPrompt(node) {
  return node.attributes.some(attr => {
    if (attr.type !== 'JSXAttribute') return false;

    const nameNode = attr.name;
    const propName =
      nameNode.type === 'JSXIdentifier'
        ? nameNode.name
        : nameNode.type === 'JSXNamespacedName'
          ? `${nameNode.namespace.name}:${nameNode.name.name}`
          : null;

    if (propName !== 'oidcPrompt') return false;

    const value = attr.value;
    if (!value) return false;

    // `oidcPrompt="select_account"`
    if (value.type === 'Literal' && value.value === 'select_account')
      return true;

    // `oidcPrompt={'select_account'}`
    if (
      value.type === 'JSXExpressionContainer' &&
      value.expression.type === 'Literal' &&
      value.expression.value === 'select_account'
    )
      return true;

    // `oidcPrompt={CLERK_COMPONENT_OPTIONS.oidcPrompt}` — a valid direct reference
    if (
      value.type === 'JSXExpressionContainer' &&
      value.expression.type === 'MemberExpression' &&
      value.expression.object.type === 'Identifier' &&
      value.expression.object.name === 'CLERK_COMPONENT_OPTIONS' &&
      value.expression.property.type === 'Identifier' &&
      value.expression.property.name === 'oidcPrompt'
    )
      return true;

    return false;
  });
}

/**
 * Returns true if the file path is inside app/(auth)/ (the scoped zone for
 * this rule). The check is intentionally broad so it catches both Unix and
 * Windows path separators.
 *
 * @param {string} filename
 */
function isInAuthAppDir(filename) {
  return filename.includes('app/(auth)/') || filename.includes('app\\(auth)\\');
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require <SignIn> and <SignUp> in app/(auth)/** to include oidcPrompt via CLERK_COMPONENT_OPTIONS or an explicit prop.',
      url: 'https://github.com/jovie/jovie/blob/main/apps/web/lib/auth/clerk-options.ts',
    },
    messages: {
      missingOidcPrompt:
        '<{{componentName}}> must either spread CLERK_COMPONENT_OPTIONS or pass oidcPrompt="select_account" explicitly. ' +
        'Missing this causes silent OAuth account switching. ' +
        'Fix: import { CLERK_COMPONENT_OPTIONS } from "@/lib/auth/clerk-options" and add {{spread}} to the element.',
    },
    schema: [],
  },
  create(context) {
    // ESLint 9+ uses context.filename; ESLint 8 uses context.getFilename()
    const filename =
      typeof context.filename === 'string'
        ? context.filename
        : typeof context.getFilename === 'function'
          ? context.getFilename()
          : '';

    // Only enforce inside app/(auth)/ — do not flag other usages
    if (!isInAuthAppDir(filename)) {
      return {};
    }

    return {
      JSXOpeningElement(node) {
        const nameNode = node.name;

        // Extract component name (handles <SignIn>, <SignUp>, and namespaced <Clerk.SignIn>)
        let componentName = null;
        if (nameNode.type === 'JSXIdentifier') {
          componentName = nameNode.name;
        } else if (nameNode.type === 'JSXMemberExpression') {
          componentName = nameNode.property.name;
        }

        if (componentName !== 'SignIn' && componentName !== 'SignUp') return;

        // Check for either allowed form
        if (hasClerkOptionSpread(node) || hasExplicitOidcPrompt(node)) return;

        context.report({
          node,
          messageId: 'missingOidcPrompt',
          data: {
            componentName,
            spread: `{...CLERK_COMPONENT_OPTIONS}`,
          },
        });
      },
    };
  },
};
