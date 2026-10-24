'use strict';

/**
 * Shared casing validators for canonical UI label linting.
 *
 * Rules mirror DESIGN.md → Text Casing and .claude/rules/ui.md:
 * - Sentence case for labels, headings, buttons, nav, column headers, badges
 * - Sentence case for body text, descriptions, tooltips, toasts
 * - Never ALL CAPS (except approved abbreviations)
 * - Never lowercase the first word of a visible label
 */

const ABBREVIATIONS = new Set([
  'EP',
  'LP',
  'ISRC',
  'UPC',
  'UPC/EAN',
  'DSP',
  'PRO',
  'BMI',
  'ASCAP',
  'AI',
  'API',
  'CSV',
  'FAQ',
  'GDPR',
  'ID',
  'LTV',
  'OAuth',
  'OS',
  'PDF',
  'QR',
  'SMS',
  'SSO',
  'UI',
  'URL',
  'USD',
  'UTM',
  'UX',
  'YC',
]);

/** Brand or product words that keep internal capitalization. */
const BRAND_WORDS = new Set([
  'Ovie',
  'Stripe',
  'Mac',
  'macOS',
  'Apple',
  'Clerk',
  'GitHub',
  'Instagram',
  'iOS',
  'Jovie',
  'Linear',
  'Linear.app',
  'LinkedIn',
  'SoundCloud',
  'Spotify',
  'TikTok',
  'Venmo',
  'YouTube',
  'iPhone',
  'vCard',
]);

const ALLOWLIST_COMMENT_PATTERN = /ui-casing-allow:/i;

/** JSX components whose child text should be sentence case. */
const LABEL_COMPONENTS = new Set([
  'AlertTitle',
  'Badge',
  'BreadcrumbPage',
  'Button',
  'CardTitle',
  'DialogTitle',
  'DrawerTitle',
  'DropdownMenuLabel',
  'FormLabel',
  'Label',
  'SheetTitle',
  'SidebarMenuButton',
  'TableHead',
  'TabsTrigger',
]);

/** JSX components whose child text should be sentence case. */
const SENTENCE_CASE_COMPONENTS = new Set([
  'AlertDescription',
  'CardDescription',
  'DialogDescription',
  'DrawerDescription',
  'SheetDescription',
  'TooltipContent',
]);

const HEADING_ELEMENTS = new Set(['h1', 'h2', 'h3', 'h4']);

/** JSX props that carry sentence-case UI labels. */
const LABEL_PROPS = new Set(['aria-label', 'label']);

/** JSX props that carry sentence-case body copy. */
const SENTENCE_CASE_PROPS = new Set(['description', 'placeholder']);

/** Object literal keys for config arrays (nav items, table columns, etc.). */
const LABEL_OBJECT_KEYS = new Set(['header', 'label']);

/** Object literal keys for sentence-case copy in config objects. */
const SENTENCE_CASE_OBJECT_KEYS = new Set(['description']);

const TOAST_CALLEE_NAMES = new Set([
  'error',
  'info',
  'message',
  'success',
  'warning',
]);

const UI_SCOPED_PATH_PATTERNS = [
  /\/components\//,
  /\/app\//,
  /\/packages\/ui\//,
];

const ALLOWED_PATH_FRAGMENTS = [
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  '.stories.ts',
  '.stories.tsx',
  '__tests__/',
  '/data/',
  '/eslint-rules/',
  '/lib/',
  '/scripts/',
  '/tests/',
  '/types/',
  'app/api/',
  'authCopy',
];

/**
 * @param {string} value
 */
function normalizeText(value) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} word
 */
function stripEdgePunctuation(word) {
  return word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
}

/**
 * @param {string} word
 */
function isAbbreviation(word) {
  return ABBREVIATIONS.has(word);
}

/**
 * @param {string} word
 */
function isBrandWord(word) {
  return BRAND_WORDS.has(word.replace(/[’']s$/, ''));
}

/**
 * @param {string} value
 */
function shouldSkipLiteral(value) {
  const trimmed = normalizeText(value);
  if (!trimmed) return true;
  if (!/[A-Za-z]/.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/[{}\[\]$`]/.test(trimmed)) return true;
  if (/^\/.+\//.test(trimmed)) return true;
  if (/^[a-z]+(?:-[a-z]+)+$/.test(trimmed)) return true;
  if (/^[a-z]+(?:_[a-z]+)+$/.test(trimmed)) return true;
  if (/^v?\d+(?:\.\d+)+$/.test(trimmed)) return true;
  return false;
}

function toCanonicalSentenceCase(value) {
  let sentenceStart = true;
  return normalizeText(value)
    .split(' ')
    .map((raw, index, tokens) => {
      const word = stripEdgePunctuation(raw);
      const proper =
        /^I(?:[’'](?:m|ve|ll|d))?$/.test(word) ||
        isAbbreviation(word) ||
        isBrandWord(word) ||
        (word === 'Music' &&
          stripEdgePunctuation(tokens[index - 1] ?? '') === 'Apple');
      const core = proper
        ? word
        : sentenceStart
          ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          : word.toLowerCase();
      const result = word ? raw.replace(word, core) : raw;
      if (word) sentenceStart = /[.!?][)"'\]]*$/.test(raw);
      return result;
    })
    .join(' ');
}

function isSentenceCase(value) {
  return (
    shouldSkipLiteral(value) ||
    normalizeText(value) === toCanonicalSentenceCase(value)
  );
}

/**
 * @param {string} filename
 */
function isUiScopedFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  if (!UI_SCOPED_PATH_PATTERNS.some(pattern => pattern.test(normalized))) {
    return false;
  }
  return !ALLOWED_PATH_FRAGMENTS.some(fragment =>
    normalized.includes(fragment)
  );
}

/**
 * @param {import('eslint').Rule.RuleContext} context
 * @param {import('@typescript-eslint/types').TSESTree.Node} node
 */
function hasAllowlistComment(node, context) {
  const sourceCode = context.sourceCode || context.getSourceCode();
  const comments = sourceCode.getAllComments ? sourceCode.getAllComments() : [];
  const nodeLine = node.loc?.start?.line;
  if (nodeLine == null) return false;

  return comments.some(comment => {
    const commentLine = comment.loc?.start?.line;
    if (commentLine == null) return false;
    if (commentLine !== nodeLine && commentLine !== nodeLine - 1) return false;
    return ALLOWLIST_COMMENT_PATTERN.test(comment.value);
  });
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.JSXOpeningElement | import('@typescript-eslint/types').TSESTree.JSXOpeningFragment} openingElement
 */
function getJsxElementName(openingElement) {
  const nameNode = openingElement.name;
  if (!nameNode) return null;

  if (nameNode.type === 'JSXIdentifier') {
    return nameNode.name;
  }

  if (nameNode.type === 'JSXMemberExpression') {
    return nameNode.property.name;
  }

  return null;
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.JSXAttribute} attribute
 */
function getJsxAttributeName(attribute) {
  const nameNode = attribute.name;
  if (nameNode.type === 'JSXIdentifier') return nameNode.name;
  if (nameNode.type === 'JSXNamespacedName') {
    return `${nameNode.namespace.name}:${nameNode.name.name}`;
  }
  return null;
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.JSXAttribute['value']} valueNode
 */
function getStringFromJsxAttributeValue(valueNode) {
  if (!valueNode) return null;
  if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
    return valueNode.value;
  }
  if (
    valueNode.type === 'JSXExpressionContainer' &&
    valueNode.expression.type === 'Literal' &&
    typeof valueNode.expression.value === 'string'
  ) {
    return valueNode.expression.value;
  }
  return null;
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.Node} node
 * @returns {string | null}
 */
function getStringLiteralValue(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  if (node.type === 'JSXText') {
    return node.value;
  }

  if (node.type === 'TemplateElement') {
    return node.value.cooked ?? node.value.raw;
  }

  return null;
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.CallExpression} node
 */
function isToastCall(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier' && callee.name === 'toast') return true;
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'toast' &&
    callee.property.type === 'Identifier' &&
    TOAST_CALLEE_NAMES.has(callee.property.name)
  ) {
    return true;
  }
  return false;
}

module.exports = {
  ALLOWLIST_COMMENT_PATTERN,
  BRAND_WORDS,
  HEADING_ELEMENTS,
  SENTENCE_CASE_COMPONENTS,
  SENTENCE_CASE_OBJECT_KEYS,
  SENTENCE_CASE_PROPS,
  LABEL_COMPONENTS,
  LABEL_OBJECT_KEYS,
  LABEL_PROPS,
  getJsxAttributeName,
  getJsxElementName,
  getStringFromJsxAttributeValue,
  getStringLiteralValue,
  hasAllowlistComment,
  isSentenceCase,
  toCanonicalSentenceCase,
  isToastCall,
  isUiScopedFile,
  shouldSkipLiteral,
};
