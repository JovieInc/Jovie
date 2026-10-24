/**
 * ESLint rule to enforce canonical casing for UI labels.
 *
 * DESIGN.md → Text Casing:
 * - Sentence case for labels, headings, buttons, badges, nav items, column headers
 * - Sentence case for body text, descriptions, tooltips, and toasts
 *
 * Allow intentional exceptions with an inline comment:
 *   {/* ui-casing-allow: brand lockup * /}
 *
 * Scope: UI-facing files under components/, app/, and packages/ui/.
 * Tests, stories, data files, and lib/ utilities are excluded.
 */

'use strict';

const path = require('node:path');
const baseline = require('./canonical-ui-label-casing.baseline.json');

const {
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
  isToastCall,
  isUiScopedFile,
  toCanonicalSentenceCase,
} = require('./canonical-ui-label-casing-utils');

const runAllowances = new WeakMap();

/**
 * @param {import('eslint').Rule.RuleContext} context
 * @param {import('@typescript-eslint/types').TSESTree.Node} node
 * @param {string} value
 * @param {string} contextLabel
 */
function reportCasingViolation(context, node, value, contextLabel) {
  if (hasAllowlistComment(node, context)) return;

  if (isSentenceCase(value)) return;
  const key = `${contextLabel}: ${value.replace(/\s+/g, ' ').trim()}`;
  const allowances = runAllowances.get(context);
  if (allowances?.[key] > 0) {
    allowances[key]--;
    return;
  }

  context.report({
    node,
    messageId: 'useSentenceCase',
    data: {
      contextLabel,
      value,
      suggestion: toCanonicalSentenceCase(value),
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
        'Enforce canonical sentence case for UI labels per DESIGN.md',
      recommended: true,
    },
    messages: {
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

    const relativePath = path
      .relative(path.resolve(__dirname, '..'), filename)
      .replaceAll('\\', '/');
    runAllowances.set(context, { ...baseline[relativePath] });

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
          LABEL_COMPONENTS.has(componentName) ||
          HEADING_ELEMENTS.has(componentName)
        ) {
          for (const child of staticChildren) {
            reportCasingViolation(
              context,
              child.node,
              child.value,
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

        if (LABEL_PROPS.has(propName)) {
          reportCasingViolation(context, node, stringValue, `${propName} prop`);
          return;
        }

        if (SENTENCE_CASE_PROPS.has(propName)) {
          reportCasingViolation(context, node, stringValue, `${propName} prop`);
        }
      },

      Property(node) {
        if (node.key.type !== 'Identifier') return;
        const propName = node.key.name;
        if (
          !LABEL_OBJECT_KEYS.has(propName) &&
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

        if (LABEL_OBJECT_KEYS.has(propName)) {
          reportCasingViolation(
            context,
            node.value,
            node.value.value,
            `${propName} property`
          );
          return;
        }

        reportCasingViolation(
          context,
          node.value,
          node.value.value,
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
          'toast message'
        );
      },
    };
  },
};
