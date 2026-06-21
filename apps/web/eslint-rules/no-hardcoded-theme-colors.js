/**
 * ESLint rule: no-hardcoded-theme-colors
 *
 * Flags bare `text-black` and `bg-white` Tailwind classes that appear WITHOUT
 * a `dark:` counterpart in the same class string.  These cause black-on-black
 * (or white-on-white) contrast failures when the app renders in dark mode.
 *
 * Compliant patterns:
 *   'text-black dark:text-white'  — has a dark counterpart ✓
 *   'dark:text-white'             — dark-only, explicit intent ✓
 *   'text-primary-token'          — semantic token, auto-adapts ✓
 *
 * Flagged patterns:
 *   'text-black'                  — no dark: counterpart, invisible in dark mode ✗
 *   'bg-white px-4'               — bg-white without dark:bg-* ✗
 *
 * @see .claude/rules/ui.md
 * @see apps/web/contrast-ratchet.baseline.json  — ratchet guard for legacy violations
 */

// Files that may intentionally use absolute colors (brand assets, always-dark surfaces).
const ALLOWED_PATH_FRAGMENTS = [
  '/apps/web/eslint-rules/',
  '/apps/web/styles/',
  '/tailwind.config.',
  '/app/globals.',
  '.stories.',
  '.storybook/',
  '.test.',
  '.spec.',
  '/scripts/',
];

function isAllowedFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return ALLOWED_PATH_FRAGMENTS.some(fragment => normalized.includes(fragment));
}

// Patterns that indicate an intentional always-dark or always-light surface
// (e.g. gradient overlays, frosted glass, brand pill buttons).
// These are heuristics — we look for opacity modifiers that signal an overlay.
function hasOpacityModifier(value) {
  // e.g. bg-white/5, text-black/20, bg-white/[0.03]
  return /(?:text-black|bg-white)\s*\//.test(value);
}

/**
 * Returns a violation message when a class string contains a bare
 * `text-black` or `bg-white` without a matching `dark:` counterpart.
 * Returns null when the string is safe.
 */
function findHardcodedThemeColorViolation(classString) {
  if (typeof classString !== 'string' || classString.length === 0) {
    return null;
  }

  // Allow opacity-modified variants — these are intentional overlay patterns
  // (bg-white/5, text-black/20) and not absolute colors.
  if (hasOpacityModifier(classString)) {
    return null;
  }

  // Bare text-black without a dark:text-* in the same string
  if (
    /(?:^|\s)text-black(?:\s|$)/.test(classString) &&
    !classString.includes('dark:text-')
  ) {
    return {
      messageId: 'bareTextBlack',
      data: { value: 'text-black' },
    };
  }

  // Bare bg-white without a dark:bg-* in the same string
  if (
    /(?:^|\s)bg-white(?:\s|$)/.test(classString) &&
    !classString.includes('dark:bg-')
  ) {
    return {
      messageId: 'bareBgWhite',
      data: { value: 'bg-white' },
    };
  }

  return null;
}

/**
 * Generator that yields { node, value } pairs for every string we can extract
 * from a JSX className expression (Literal, TemplateLiteral, cn(...) calls,
 * conditional expressions, etc.).
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
      if (cooked) yield { node: quasi, value: cooked };
    }
    return;
  }
  if (node.type === 'CallExpression') {
    // cn(...) / clsx(...) / cva(...) calls
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
        'Disallow bare text-black / bg-white without a dark: counterpart — prevents black-on-black contrast failures in dark mode',
      recommended: false,
    },
    messages: {
      bareTextBlack:
        '`text-black` without a `dark:text-*` counterpart causes invisible text in dark mode. ' +
        'Use a semantic token (`text-primary-token`) or pair with `dark:text-white`. ' +
        'See contrast-ratchet.baseline.json for the current violation count.',
      bareBgWhite:
        '`bg-white` without a `dark:bg-*` counterpart may cause invisible text in dark mode. ' +
        'Use a semantic token (`bg-surface-1`) or pair with `dark:bg-{dark-surface}`. ' +
        'See contrast-ratchet.baseline.json for the current violation count.',
    },
    schema: [],
  },

  create(context) {
    const filename = (
      context.filename ??
      context.getFilename?.() ??
      ''
    ).replaceAll('\\', '/');

    if (isAllowedFile(filename)) {
      return {};
    }

    return {
      JSXAttribute(node) {
        if (
          !node.name ||
          node.name.type !== 'JSXIdentifier' ||
          node.name.name !== 'className'
        ) {
          return;
        }

        for (const { node: valueNode, value } of extractClassStrings(
          node.value
        )) {
          const violation = findHardcodedThemeColorViolation(value);
          if (violation) {
            context.report({
              node: valueNode,
              messageId: violation.messageId,
              data: violation.data,
            });
          }
        }
      },
    };
  },
};
