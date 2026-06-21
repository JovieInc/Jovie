/**
 * ESLint rule: no-hardcoded-theme-colors
 *
 * Flags Tailwind class utilities that bypass System B semantic tokens:
 *
 *   bare text-black / text-white — raw absolute colors without a dark: counterpart
 *   bare bg-white   / bg-black  — same, but for backgrounds
 *   text-[#hex]  / bg-[#hex] / border-[#hex] — arbitrary hex is always banned
 *
 * Compliant patterns:
 *   'text-black dark:text-white'  — paired for both themes ✓
 *   'dark:text-white'             — dark-only, explicit intent ✓
 *   'text-primary-token'          — semantic token, auto-adapts ✓
 *   'bg-white/5'                  — opacity-modified overlay (intentional) ✓
 *
 * Flagged patterns:
 *   'text-black'                  — invisible in dark mode ✗
 *   'bg-white px-4'               — white bg traps dark text in dark mode ✗
 *   'text-white'                  — invisible in light mode without dark: pair ✗
 *   'bg-black'                    — may be invisible in dark mode without dark: pair ✗
 *   'text-[#fff]'                 — arbitrary hex bypasses token system ✗
 *   'bg-[#000000]'                — arbitrary hex bypasses token system ✗
 *   'border-[#aabbcc]'            — arbitrary hex bypasses token system ✗
 *
 * @see .claude/rules/ui.md
 * @see DESIGN.md → "Use tokens, not raw colors"
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

/**
 * Check whether a class string contains the token in its opacity-modified form
 * (e.g. text-black/20, bg-white/5, bg-black/[0.03]).  These are intentional
 * overlay patterns, not absolute colors, so we leave them alone.
 */
function hasOpacityVariant(classString, token) {
  return new RegExp(`(?:^|\\s)${token.replace('-', '\\-')}/`).test(classString);
}

/**
 * Returns a violation descriptor when a class string contains a bare
 * raw-color token without the required dark: counterpart.
 * Returns null when the string is safe.
 */
function findHardcodedThemeColorViolation(classString) {
  if (typeof classString !== 'string' || classString.length === 0) {
    return null;
  }

  // ── bare text-black ───────────────────────────────────────────────────────
  if (
    !hasOpacityVariant(classString, 'text-black') &&
    /(?:^|\s)text-black(?:\s|$)/.test(classString) &&
    !classString.includes('dark:text-')
  ) {
    return { messageId: 'bareTextBlack' };
  }

  // ── bare text-white ───────────────────────────────────────────────────────
  if (
    !hasOpacityVariant(classString, 'text-white') &&
    /(?:^|\s)text-white(?:\s|$)/.test(classString) &&
    !classString.includes('dark:text-')
  ) {
    return { messageId: 'bareTextWhite' };
  }

  // ── bare bg-white ─────────────────────────────────────────────────────────
  if (
    !hasOpacityVariant(classString, 'bg-white') &&
    /(?:^|\s)bg-white(?:\s|$)/.test(classString) &&
    !classString.includes('dark:bg-')
  ) {
    return { messageId: 'bareBgWhite' };
  }

  // ── bare bg-black ─────────────────────────────────────────────────────────
  if (
    !hasOpacityVariant(classString, 'bg-black') &&
    /(?:^|\s)bg-black(?:\s|$)/.test(classString) &&
    !classString.includes('dark:bg-')
  ) {
    return { messageId: 'bareBgBlack' };
  }

  // ── arbitrary hex colors ─────────────────────────────────────────────────
  // text-[#hex], bg-[#hex], border-[#hex] always bypass the token system.
  // There is no "paired dark:" exception — use a semantic token instead.
  if (/(?:text|bg|border)-\[#[0-9a-fA-F]/.test(classString)) {
    return { messageId: 'arbitraryHexColor' };
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
        'Disallow raw Tailwind color utilities (text-black/white, bg-white/black, arbitrary hex) without System B semantic tokens or dark: counterparts — prevents invisible-text contrast failures across themes',
      recommended: false,
    },
    messages: {
      bareTextBlack:
        '`text-black` without a `dark:text-*` counterpart causes invisible text in dark mode. ' +
        'Use a semantic token (`text-foreground`) or pair with `dark:text-white`. ' +
        'See DESIGN.md → "Use tokens, not raw colors".',
      bareTextWhite:
        '`text-white` without a `dark:text-*` counterpart may cause invisible text in light mode. ' +
        'Use a semantic token (`text-foreground`) or pair with `dark:text-black`. ' +
        'See DESIGN.md → "Use tokens, not raw colors".',
      bareBgWhite:
        '`bg-white` without a `dark:bg-*` counterpart may cause invisible text in dark mode. ' +
        'Use a semantic token (`bg-background` or `bg-surface-1`) or pair with `dark:bg-{dark-surface}`. ' +
        'See DESIGN.md → "Use tokens, not raw colors".',
      bareBgBlack:
        '`bg-black` without a `dark:bg-*` counterpart may be invisible in dark mode. ' +
        'Use a semantic token (`bg-background`) or pair with `dark:bg-{light-surface}`. ' +
        'See DESIGN.md → "Use tokens, not raw colors".',
      arbitraryHexColor:
        'Arbitrary hex color (e.g. `text-[#fff]`, `bg-[#000]`) bypasses the System B token layer. ' +
        'Use a semantic token (`text-foreground`, `bg-surface-1`, `border-border`) instead. ' +
        'See DESIGN.md → "Use tokens, not raw colors".',
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
            });
          }
        }
      },
    };
  },
};
