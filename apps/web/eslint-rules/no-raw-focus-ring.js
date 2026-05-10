/**
 * ESLint rule to enforce design-system focus ring utilities on interactive elements.
 *
 * Interactive elements (button, input, textarea, a, [role="button"]) must use the
 * design-system canonical focus utilities instead of raw Tailwind focus ring classes:
 *
 *   Canonical utilities (use these):
 *     - focus-ring-themed  (global CSS utility class, .focus-ring-themed in globals.css)
 *     - focus-ring         (alternative global utility)
 *     - focus-visible:*    (any focus-visible: prefixed class — these are correct)
 *
 *   Banned on interactive elements (use focus-ring-themed or focus-visible:* instead):
 *     - focus:ring-{any}   — applies on ALL focus events, not keyboard-only
 *     - focus:outline-{any} — applies on ALL focus events, not keyboard-only
 *
 * Exceptions:
 *   - focus:outline-none is allowed standalone (suppressing the default outline so
 *     focus-visible:* can take over is a standard pattern)
 *   - focus:ring-0 is allowed standalone (explicitly removing a ring is OK)
 *   - Non-interactive elements may use focus:ring/focus:outline freely
 *   - Skip links (.sr-only + focus:not-sr-only pattern) are explicitly allowed
 *   - Scrollable containers using focus:outline-none for UX purposes are allowed
 *
 * Bad:  className="focus:ring-2 focus:ring-accent"
 * Bad:  className="focus:ring-1 focus:ring-indigo-500"
 * Good: className="focus-ring-themed"
 * Good: className="focus-visible:ring-2 focus-visible:ring-accent"
 * OK:   className="focus:outline-none focus-visible:ring-2 ..."
 *
 * @see apps/web/app/globals.css for .focus-ring-themed and .focus-ring definitions
 */

// Patterns for raw focus:ring that are NOT just focus:ring-0
const RAW_FOCUS_RING_PATTERN = /\bfocus:ring-(?!0\b)(\S+)/;

// Patterns for raw focus:outline that are NOT just focus:outline-none
const RAW_FOCUS_OUTLINE_PATTERN = /\bfocus:outline-(?!none\b)(\S+)/;

// JSX element names that are interactive and therefore must use canonical focus styles
const INTERACTIVE_ELEMENT_NAMES = new Set([
  'button',
  'a',
  'input',
  'textarea',
  'select',
]);

// Path fragments to skip entirely (design system atoms, test files, design tokens)
const ALLOWED_PATH_FRAGMENTS = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  'eslint-rules/',
  '/stories/',
  '.stories.ts',
  '.stories.tsx',
  'tailwind.config.',
  '/styles/',
  '/globals.css',
  // Allow inside the SkipToContent atom — it uses focus:ring for a11y skip link
  'SkipToContent.tsx',
];

/**
 * Detect if className string contains a banned raw focus ring class
 * (not covered by the allowed exceptions).
 */
function findBannedFocusClasses(classString) {
  if (typeof classString !== 'string') return null;

  // Banned: focus:ring-{something} where something is not "0"
  const ringMatch = RAW_FOCUS_RING_PATTERN.exec(classString);
  if (ringMatch) {
    return {
      banned: ringMatch[0],
      message: `Raw \`${ringMatch[0]}\` applies on all focus events. Use \`focus-ring-themed\` or \`focus-visible:ring-*\` instead to restrict to keyboard focus only.`,
    };
  }

  // Banned: focus:outline-{something} where something is not "none"
  const outlineMatch = RAW_FOCUS_OUTLINE_PATTERN.exec(classString);
  if (outlineMatch) {
    return {
      banned: outlineMatch[0],
      message: `Raw \`${outlineMatch[0]}\` applies on all focus events. Use \`focus-ring-themed\` or \`focus-visible:outline-*\` for keyboard-only focus styles.`,
    };
  }

  return null;
}

/**
 * Check if a JSX element is interactive (button, a, input, textarea, select,
 * or any element with role="button").
 */
function isInteractiveElement(node) {
  if (node.type !== 'JSXOpeningElement') return false;

  const name = node.name;

  // Direct tag names: button, a, input, etc.
  if (
    name.type === 'JSXIdentifier' &&
    INTERACTIVE_ELEMENT_NAMES.has(name.name)
  ) {
    return true;
  }

  // Any element with role="button"
  const roleAttr = node.attributes.find(
    attr =>
      attr.type === 'JSXAttribute' &&
      attr.name?.type === 'JSXIdentifier' &&
      attr.name.name === 'role' &&
      attr.value?.type === 'Literal' &&
      attr.value.value === 'button'
  );
  if (roleAttr) return true;

  return false;
}

/**
 * Resolve a string value from a JSX className node value.
 * Handles Literal strings and TemplateLiteral quasis.
 */
function* extractClassStrings(node) {
  if (!node) return;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    yield { node, value: node.value };
    return;
  }
  if (node.type === 'JSXExpressionContainer') {
    yield* extractClassStrings(node.expression);
    return;
  }
  if (node.type === 'TemplateLiteral') {
    for (const quasi of node.quasis) {
      const cooked = quasi.value.cooked ?? '';
      if (cooked) {
        yield { node: quasi, value: cooked };
      }
    }
    return;
  }
  if (node.type === 'CallExpression') {
    // Handle cn(...) / clsx(...) / cva(...) calls
    for (const arg of node.arguments) {
      yield* extractClassStrings(arg);
    }
    return;
  }
  if (node.type === 'LogicalExpression' || node.type === 'BinaryExpression') {
    yield* extractClassStrings(node.left);
    yield* extractClassStrings(node.right);
    return;
  }
  if (node.type === 'ConditionalExpression') {
    yield* extractClassStrings(node.consequent);
    yield* extractClassStrings(node.alternate);
    return;
  }
  if (node.type === 'ArrayExpression') {
    for (const element of node.elements) {
      if (element) yield* extractClassStrings(element);
    }
    return;
  }
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce design-system focus-visible utilities on interactive elements instead of raw focus:ring/focus:outline classes',
      recommended: true,
    },
    messages: {
      rawFocusRing:
        'Raw focus ring class detected on interactive element: {{message}} See apps/web/app/globals.css for .focus-ring-themed utility.',
    },
    schema: [],
  },

  create(context) {
    const filename = (context.filename || context.getFilename()).replaceAll(
      '\\',
      '/'
    );

    // Skip allowed files
    if (ALLOWED_PATH_FRAGMENTS.some(fragment => filename.includes(fragment))) {
      return {};
    }

    // Track current JSX opening element context for className checks
    const elementStack = [];

    return {
      JSXOpeningElement(node) {
        elementStack.push(isInteractiveElement(node));
      },

      'JSXOpeningElement:exit'() {
        elementStack.pop();
      },

      JSXAttribute(node) {
        // Only check className attributes
        if (
          !node.name ||
          node.name.type !== 'JSXIdentifier' ||
          node.name.name !== 'className'
        ) {
          return;
        }

        // Only flag when inside an interactive element
        const isInteractive = elementStack[elementStack.length - 1];
        if (!isInteractive) return;

        // Check all string values we can extract from the className expression
        for (const { node: valueNode, value } of extractClassStrings(
          node.value
        )) {
          const violation = findBannedFocusClasses(value);
          if (violation) {
            context.report({
              node: valueNode,
              messageId: 'rawFocusRing',
              data: { message: violation.message },
            });
          }
        }
      },
    };
  },
};
