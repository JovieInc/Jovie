/**
 * ESLint rule to flag raw motion values that bypass the canonical
 * DS_FOUNDATION_V1 motion tokens.
 *
 * Use the canonical Tailwind utilities instead:
 *   duration-subtle      -> --ds-motion-subtle-duration (150ms)
 *   duration-cinematic   -> --ds-motion-cinematic-duration (420ms)
 *   ease-subtle          -> --ds-motion-subtle-easing
 *   ease-cinematic       -> --ds-motion-cinematic-easing
 *
 * Bad:  className="transition-all duration-300"
 * Bad:  style={{ transitionDuration: '300ms' }}
 * Bad:  style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
 * Good: className="transition-colors duration-subtle ease-subtle"
 *
 * Warn-level in Wave 1c; promoted to error in Wave 4 after Wave 2 migrates
 * existing route-level CSS consumers.
 */

const RAW_MS_DURATION_REGEX = /\b\d+ms\b/;
const CUBIC_BEZIER_REGEX = /cubic-bezier\s*\(/;
const TRANSITION_ALL_REGEX = /\btransition-all\b/;
const NUMERIC_DURATION_CLASS_REGEX = /\bduration-\d+\b/;
const NUMERIC_EASE_CLASS_REGEX = /\bease-\[/;

const ALLOWED_PATH_FRAGMENTS = [
  '/apps/web/styles/',
  '/apps/web/eslint-rules/',
  '.stories.',
  '.test.',
  '.spec.',
  '/tailwind.config.',
];

function isAllowedFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return ALLOWED_PATH_FRAGMENTS.some(fragment => normalized.includes(fragment));
}

function checkClassNameLiteral(node, value, context) {
  if (typeof value !== 'string') return;
  if (TRANSITION_ALL_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'transitionAll',
    });
  }
  if (NUMERIC_DURATION_CLASS_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'numericDurationClass',
      data: { value: value.match(NUMERIC_DURATION_CLASS_REGEX)?.[0] ?? '' },
    });
  }
  if (NUMERIC_EASE_CLASS_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'arbitraryEaseClass',
    });
  }
}

function checkInlineStyleValue(node, value, context) {
  if (typeof value !== 'string') return;
  if (CUBIC_BEZIER_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'rawCubicBezier',
    });
  }
  if (RAW_MS_DURATION_REGEX.test(value)) {
    context.report({
      node,
      messageId: 'rawMsDuration',
      data: { value: value.match(RAW_MS_DURATION_REGEX)?.[0] ?? '' },
    });
  }
}

function getScopeForNode(node, context) {
  const sourceCode = context.sourceCode || context.getSourceCode();
  if (typeof sourceCode.getScope === 'function') {
    return sourceCode.getScope(node);
  }
  if (typeof context.getScope === 'function') {
    return context.getScope();
  }
  return null;
}

function checkIdentifierInitializer(node, context, seen) {
  let scope = getScopeForNode(node, context);
  while (scope) {
    const variable = scope.variables.find(item => item.name === node.name);
    const definition = variable?.defs?.[0];
    const init = definition?.node?.init;
    if (init) {
      checkExpressionForClassNames(init, context, seen);
      return;
    }
    scope = scope.upper;
  }
}

function checkTemplateLiteral(node, context) {
  for (const quasi of node.quasis) {
    checkClassNameLiteral(quasi, quasi.value.cooked ?? '', context);
  }
}

function checkExpressionForClassNames(node, context, seen = new Set()) {
  if (!node || seen.has(node)) return;
  seen.add(node);

  switch (node.type) {
    case 'Literal':
      checkClassNameLiteral(node, node.value, context);
      return;
    case 'TemplateLiteral':
      checkTemplateLiteral(node, context);
      return;
    case 'TaggedTemplateExpression':
      checkExpressionForClassNames(node.quasi, context, seen);
      return;
    case 'CallExpression':
      for (const argument of node.arguments) {
        checkExpressionForClassNames(argument, context, seen);
      }
      return;
    case 'LogicalExpression':
    case 'BinaryExpression':
      checkExpressionForClassNames(node.left, context, seen);
      checkExpressionForClassNames(node.right, context, seen);
      return;
    case 'ConditionalExpression':
      checkExpressionForClassNames(node.consequent, context, seen);
      checkExpressionForClassNames(node.alternate, context, seen);
      return;
    case 'ArrayExpression':
      for (const element of node.elements) {
        checkExpressionForClassNames(element, context, seen);
      }
      return;
    case 'Identifier':
      checkIdentifierInitializer(node, context, seen);
      return;
    case 'ChainExpression':
    case 'TSAsExpression':
    case 'TSTypeAssertion':
    case 'TSNonNullExpression':
      checkExpressionForClassNames(node.expression, context, seen);
      return;
    default:
      return;
  }
}

function isJSXInlineStyleProperty(node) {
  const objectExpression = node.parent;
  const expressionContainer = objectExpression?.parent;
  const attribute = expressionContainer?.parent;

  return (
    objectExpression?.type === 'ObjectExpression' &&
    expressionContainer?.type === 'JSXExpressionContainer' &&
    attribute?.type === 'JSXAttribute' &&
    attribute.name?.name === 'style'
  );
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow raw motion values in TSX/TS — use canonical DS_FOUNDATION_V1 motion tokens instead',
      recommended: false,
    },
    messages: {
      transitionAll:
        'Avoid `transition-all` — it animates every property and ignores motion tokens. Use the explicit transition utility (e.g. `transition-colors`) and pair with `duration-subtle`/`ease-subtle` from DS_FOUNDATION_V1.',
      numericDurationClass:
        'Numeric duration class `{{value}}` bypasses the DS motion taxonomy. Use `duration-subtle` (150ms) or `duration-cinematic` (420ms) instead.',
      arbitraryEaseClass:
        'Arbitrary ease class bypasses the DS motion taxonomy. Use `ease-subtle` or `ease-cinematic` instead.',
      rawMsDuration:
        'Raw `{{value}}` duration in inline style bypasses the DS motion tokens. Use `var(--ds-motion-subtle-duration)` or `var(--ds-motion-cinematic-duration)`.',
      rawCubicBezier:
        'Raw `cubic-bezier(...)` bypasses the DS motion tokens. Use `var(--ds-motion-subtle-easing)` or `var(--ds-motion-cinematic-easing)`.',
    },
    schema: [],
  },
  create(context) {
    if (isAllowedFile(context.filename)) {
      return {};
    }

    return {
      JSXAttribute(node) {
        if (!node.name) return;
        const attrName = node.name.name;

        // className="..." string literal
        if (
          attrName === 'className' &&
          node.value &&
          node.value.type === 'Literal'
        ) {
          checkClassNameLiteral(node.value, node.value.value, context);
          return;
        }

        // className={...} expression
        if (
          attrName === 'className' &&
          node.value &&
          node.value.type === 'JSXExpressionContainer'
        ) {
          checkExpressionForClassNames(node.value.expression, context);
        }
      },

      // style={{ transitionDuration: '300ms', transitionTimingFunction: 'cubic-bezier(...)' }}
      Property(node) {
        if (!isJSXInlineStyleProperty(node)) return;
        if (!node.key || !node.value) return;
        const keyName =
          node.key.type === 'Identifier'
            ? node.key.name
            : node.key.type === 'Literal'
              ? node.key.value
              : null;
        if (
          keyName !== 'transitionDuration' &&
          keyName !== 'transitionTimingFunction' &&
          keyName !== 'transition' &&
          keyName !== 'animation' &&
          keyName !== 'animationDuration' &&
          keyName !== 'animationTimingFunction'
        ) {
          return;
        }
        if (node.value.type === 'Literal') {
          checkInlineStyleValue(node.value, node.value.value, context);
        }
        if (node.value.type === 'TemplateLiteral') {
          for (const quasi of node.value.quasis) {
            checkInlineStyleValue(quasi, quasi.value.cooked ?? '', context);
          }
        }
      },
    };
  },
};
