/**
 * ESLint rule to enforce canonical casing for UI labels.
 *
 * DESIGN.md → Text Casing:
 * - Title Case for labels, headings, buttons, badges, nav items, column headers
 * - Sentence case for body text, descriptions, tooltips, and toasts
 *
 * Allow intentional exceptions with an inline comment:
 *   {/* ui-casing-allow: brand lockup * /}
 *
 * Scope: UI-facing files under components/, app/, and packages/ui/.
 * Tests, stories, data files, and lib/ utilities are excluded.
 */

'use strict';

const {
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
  toCanonicalTitleCase,
} = require('./canonical-ui-label-casing-utils');

/**
 * @param {import('eslint').Rule.RuleContext} context
 * @param {import('@typescript-eslint/types').TSESTree.Node} node
 * @param {string} value
 * @param {'title' | 'sentence'} expectedCasing
 * @param {string} contextLabel
 */
function reportCasingViolation(
  context,
  node,
  value,
  expectedCasing,
  contextLabel
) {
  if (hasAllowlistComment(node, context)) return;

  const isValid =
    expectedCasing === 'title' ? isTitleCase(value) : isSentenceCase(value);
  if (isValid) return;

  context.report({
    node,
    messageId: expectedCasing === 'title' ? 'useTitleCase' : 'useSentenceCase',
    data: {
      contextLabel,
      value,
      suggestion:
        expectedCasing === 'title'
          ? toCanonicalTitleCase(value)
          : value.charAt(0).toUpperCase() + value.slice(1),
    },
  });
}

/**
 * @param {import('@typescript-eslint/types').TSESTree.JSXElement['children']} children
 * @returns {Array<{ node: import('@typescript-eslint/types').TSESTree.Node; value: string }>}
 */
function collectStaticTextChildren(children) {
  /** @type {Array<{ node: import('@typescript-eslint/types').TSESTree.Node; value: string }>} */
  const values = [];

  for (const child of children) {
    if (child.type === 'JSXText') {
      const value = getStringLiteralValue(child);
      if (value) values.push({ node: child, value });
      continue;
    }

    if (
      child.type === 'JSXExpressionContainer' &&
      child.expression.type === 'Literal' &&
      typeof child.expression.value === 'string'
    ) {
      values.push({ node: child.expression, value: child.expression.value });
    }
  }

  return values;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce canonical Title Case / sentence case for UI labels per DESIGN.md',
      recommended: true,
    },
    messages: {
      useTitleCase:
        'UI label in {{contextLabel}} must use Title Case. Found "{{value}}". Expected "{{suggestion}}".',
      useSentenceCase:
        'UI copy in {{contextLabel}} must use sentence case. Found "{{value}}". Expected "{{suggestion}}".',
    },
    schema: [],
  },

  create(context) {
    const filename =
      typeof context.filename === 'string'
        ? context.filename
        : typeof context.getFilename === 'function'
          ? context.getFilename()
          : '';

    if (!isUiScopedFile(filename)) {
      return {};
    }

    return {
      JSXElement(node) {
        const componentName = getJsxElementName(node.openingElement);
        if (!componentName) return;

        const staticChildren = collectStaticTextChildren(node.children);
        if (staticChildren.length === 0) return;

        if (
          TITLE_CASE_COMPONENTS.has(componentName) ||
          HEADING_ELEMENTS.has(componentName)
        ) {
          for (const child of staticChildren) {
            reportCasingViolation(
              context,
              child.node,
              child.value,
              'title',
              `<${componentName}>`
            );
          }
          return;
        }

        if (SENTENCE_CASE_COMPONENTS.has(componentName)) {
          for (const child of staticChildren) {
            reportCasingViolation(
              context,
              child.node,
              child.value,
              'sentence',
              `<${componentName}>`
            );
          }
        }
      },

      JSXAttribute(node) {
        const propName = getJsxAttributeName(node);
        if (!propName) return;

        const stringValue = getStringFromJsxAttributeValue(node.value);
        if (stringValue == null) return;

        if (TITLE_CASE_PROPS.has(propName)) {
          reportCasingViolation(
            context,
            node,
            stringValue,
            'title',
            `${propName} prop`
          );
          return;
        }

        if (SENTENCE_CASE_PROPS.has(propName)) {
          reportCasingViolation(
            context,
            node,
            stringValue,
            'sentence',
            `${propName} prop`
          );
        }
      },

      Property(node) {
        if (node.key.type !== 'Identifier') return;
        const propName = node.key.name;
        if (
          !TITLE_CASE_OBJECT_KEYS.has(propName) &&
          !SENTENCE_CASE_OBJECT_KEYS.has(propName)
        ) {
          return;
        }

        if (
          node.value.type !== 'Literal' ||
          typeof node.value.value !== 'string'
        ) {
          return;
        }

        if (TITLE_CASE_OBJECT_KEYS.has(propName)) {
          reportCasingViolation(
            context,
            node.value,
            node.value.value,
            'title',
            `${propName} property`
          );
          return;
        }

        reportCasingViolation(
          context,
          node.value,
          node.value.value,
          'sentence',
          `${propName} property`
        );
      },

      CallExpression(node) {
        if (!isToastCall(node)) return;
        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== 'Literal') return;
        if (typeof firstArg.value !== 'string') return;

        reportCasingViolation(
          context,
          firstArg,
          firstArg.value,
          'sentence',
          'toast message'
        );
      },
    };
  },
};
