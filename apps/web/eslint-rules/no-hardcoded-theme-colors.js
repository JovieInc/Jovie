/**
 * ESLint rule: no-hardcoded-theme-colors
 *
 * Flags Tailwind classes that cause contrast failures when the theme flips.
 *
 * Bare absolute colors without dark: counterparts:
 *   'text-black'          — invisible in dark mode ✗
 *   'bg-white px-4'       — invisible container in dark mode ✗
 *
 * Hardcoded hex colors without dark: counterparts (JOV-11025):
 *   'text-[#000]'         — hardcoded dark text, invisible in dark mode ✗
 *   'bg-[#ffffff]'        — hardcoded white bg, invisible in dark mode ✗
 *
 * Compliant patterns:
 *   'text-black dark:text-white'  — has a dark counterpart ✓
 *   'text-[#000] dark:text-white' — hex with explicit dark counterpart ✓
 *   'dark:text-white'             — dark-only, explicit intent ✓
 *   'text-primary-token'          — semantic token, auto-adapts ✓
 *   'bg-[#000]/96'                — opacity-modified (intentional overlay) ✓
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

// Hex color in a Tailwind arbitrary value: text-[#xxx] or bg-[#xxx].
// Matches only when NOT followed by '/' (which would indicate an intentional
// opacity modifier like bg-[#06070a]/96 — treated as an overlay, not a theme color).
const HEX_TEXT_RE = /(?:^|\s)(text-\[#[0-9a-fA-F]{3,8}\])(?:\s|$)/;
const HEX_BG_RE = /(?:^|\s)(bg-\[#[0-9a-fA-F]{3,8}\])(?:\s|$)/;

/**
 * Returns an array of violations found in a class string.
 * Each violation has { messageId, data }.
 *
 * Checks:
 *   - bare `text-black` / `bg-white` without dark: counterpart
 *   - hardcoded hex `text-[#hex]` / `bg-[#hex]` without dark: counterpart
 */
function findThemeColorViolations(classString) {
  if (typeof classString !== 'string' || classString.length === 0) {
    return [];
  }

  const violations = [];

  // Absolute color checks: skip when opacity-modified (bg-white/5, text-black/20)
  if (!hasOpacityModifier(classString)) {
    if (
      /(?:^|\s)text-black(?:\s|$)/.test(classString) &&
      !classString.includes('dark:text-')
    ) {
      violations.push({
        messageId: 'bareTextBlack',
        data: { value: 'text-black' },
      });
    }

    if (
      /(?:^|\s)bg-white(?:\s|$)/.test(classString) &&
      !classString.includes('dark:bg-')
    ) {
      violations.push({
        messageId: 'bareBgWhite',
        data: { value: 'bg-white' },
      });
    }
  }

  // Hex text color without dark counterpart — causes invisible text when theme flips.
  // Hex with opacity modifier (text-[#xxx]/40) is excluded by the lookahead in HEX_TEXT_RE.
  const hexTextMatch = HEX_TEXT_RE.exec(classString);
  if (hexTextMatch && !classString.includes('dark:text-')) {
    violations.push({
      messageId: 'bareHexText',
      data: { value: hexTextMatch[1] },
    });
  }

  // Hex background without dark counterpart.
  const hexBgMatch = HEX_BG_RE.exec(classString);
  if (hexBgMatch && !classString.includes('dark:bg-')) {
    violations.push({ messageId: 'bareHexBg', data: { value: hexBgMatch[1] } });
  }

  return violations;
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
      bareHexText:
        'Hardcoded hex text color `{{value}}` without a `dark:text-*` counterpart will fail ' +
        'contrast in the opposite theme. Use a semantic System B token (`text-primary-token`) ' +
        'or add `dark:text-<token>`. See contrast-ratchet.baseline.json.',
      bareHexBg:
        'Hardcoded hex background `{{value}}` without a `dark:bg-*` counterpart will fail ' +
        'contrast in the opposite theme. Use a semantic System B token (`bg-surface-1`) ' +
        'or add `dark:bg-<token>`. See contrast-ratchet.baseline.json.',
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
          for (const violation of findThemeColorViolations(value)) {
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
