'use strict';

/**
 * Shared casing validators for canonical UI label linting.
 *
 * Rules mirror DESIGN.md → Text Casing and .claude/rules/ui.md:
 * - Title Case for labels, headings, buttons, nav, column headers, badges
 * - Sentence case for body text, descriptions, tooltips, toasts
 * - Never ALL CAPS (except approved abbreviations)
 * - Never lowercase the first word of a visible label
 */

const ABBREVIATIONS = new Set([
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
  'Apple',
  'Clerk',
  'GitHub',
  'Instagram',
  'iOS',
  'Jovie',
  'LinkedIn',
  'SoundCloud',
  'Spotify',
  'TikTok',
  'YouTube',
  'iPhone',
  'vCard',
]);

const ALLOWLIST_COMMENT_PATTERN = /ui-casing-allow:/i;

/** JSX components whose child text should be Title Case. */
const TITLE_CASE_COMPONENTS = new Set([
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

/** JSX props that carry Title Case UI labels. */
const TITLE_CASE_PROPS = new Set(['aria-label', 'label']);

/** JSX props that carry sentence-case body copy. */
const SENTENCE_CASE_PROPS = new Set(['description', 'placeholder']);

/** Object literal keys for config arrays (nav items, table columns, etc.). */
const TITLE_CASE_OBJECT_KEYS = new Set(['header', 'label']);

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
  'clerkLocalization',
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
 * @param {string} value
 * @returns {string[]}
 */
function getWords(value) {
  return normalizeText(value)
    .split(' ')
    .map(stripEdgePunctuation)
    .filter(Boolean);
}

/**
 * @param {string} word
 */
function isAbbreviation(word) {
  if (!word) return false;
  if (ABBREVIATIONS.has(word)) return true;
  return (
    word.length >= 2 && word === word.toUpperCase() && /^[A-Z0-9]+$/.test(word)
  );
}

/**
 * @param {string} word
 */
function isBrandWord(word) {
  return BRAND_WORDS.has(word);
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

/**
 * @param {string} word
 */
function toCanonicalWord(word) {
  const leading = word.match(/^[^A-Za-z0-9]*/)?.[0] ?? '';
  const trailing = word.match(/[^A-Za-z0-9]*$/)?.[0] ?? '';
  const core = word.slice(leading.length, word.length - trailing.length);
  if (!core) return word;
  if (isAbbreviation(core) || isBrandWord(core)) return word;
  return `${leading}${core.charAt(0).toUpperCase()}${core.slice(1).toLowerCase()}${trailing}`;
}

/**
 * @param {string} value
 */
function toCanonicalTitleCase(value) {
  return normalizeText(value).split(' ').map(toCanonicalWord).join(' ');
}

/**
 * @param {string} value
 */
function isAllCapsPhrase(value) {
  const words = getWords(value);
  if (words.length === 0) return false;
  if (words.length === 1 && isAbbreviation(words[0])) return false;
  return words.every(
    word => word === word.toUpperCase() && /^[A-Z]{2,}$/.test(word)
  );
}

/**
 * @param {string} value
 */
function isTitleCase(value) {
  if (shouldSkipLiteral(value)) return true;

  const trimmed = normalizeText(value);
  if (trimmed.charAt(0) !== trimmed.charAt(0).toUpperCase()) return false;
  if (isAllCapsPhrase(trimmed)) return false;

  const words = getWords(trimmed);
  for (const word of words) {
    if (isAbbreviation(word) || isBrandWord(word)) continue;
    if (!/^[A-Z][a-z0-9'&]*$/.test(word)) return false;
  }

  return trimmed === toCanonicalTitleCase(trimmed);
}

/**
 * @param {string} value
 */
function isSentenceCase(value) {
  if (shouldSkipLiteral(value)) return true;

  const trimmed = normalizeText(value);
  const words = getWords(trimmed);
  const firstWord = words[0] ?? '';
  const startsWithBrandWord =
    isBrandWord(firstWord) ||
    (firstWord.length > 1 &&
      firstWord.startsWith('i') &&
      /[A-Z]/.test(firstWord[1]));

  if (
    trimmed.charAt(0) !== trimmed.charAt(0).toUpperCase() &&
    !startsWithBrandWord
  ) {
    return false;
  }
  if (isAllCapsPhrase(trimmed)) return false;

  // Walk raw (un-stripped) tokens so sentence boundaries are respected: a
  // capitalized word is legitimate when it starts a new sentence (the previous
  // token ended with sentence-terminating punctuation). Without this, valid
  // multi-sentence copy ("...your career. Smart links...") false-positives.
  const rawWords = trimmed.split(' ');
  let prevEndsSentence = true;
  for (const raw of rawWords) {
    const word = stripEdgePunctuation(raw);
    const endsSentence = /[.!?:][)"'\]]*$/.test(raw);
    if (!word) {
      if (endsSentence) prevEndsSentence = true;
      continue;
    }
    if (
      !prevEndsSentence &&
      !isAbbreviation(word) &&
      !isBrandWord(word) &&
      /^[A-Z][a-z]/.test(word)
    ) {
      return false;
    }
    prevEndsSentence = endsSentence;
  }

  return true;
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
  TITLE_CASE_COMPONENTS,
  TITLE_CASE_OBJECT_KEYS,
  TITLE_CASE_PROPS,
  getJsxAttributeName,
  getJsxElementName,
  getStringFromJsxAttributeValue,
  getStringLiteralValue,
  hasAllowlistComment,
  isSentenceCase,
  isTitleCase,
  isToastCall,
  isUiScopedFile,
  shouldSkipLiteral,
  toCanonicalTitleCase,
};
