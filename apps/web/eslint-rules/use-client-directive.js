/**
 * ESLint rule to ensure 'use client' directive is present when using React hooks.
 *
 * In Next.js App Router, components using React hooks (useState, useEffect, etc.)
 * must be client components with the 'use client' directive.
 */

const REACT_HOOKS = new Set([
  // Core React hooks
  'useState',
  'useEffect',
  'useContext',
  'useReducer',
  'useCallback',
  'useMemo',
  'useRef',
  'useImperativeHandle',
  'useLayoutEffect',
  'useDebugValue',
  'useDeferredValue',
  'useTransition',
  'useId',
  'useSyncExternalStore',
  'useInsertionEffect',
  'useOptimistic',
  'useActionState',
  'useFormStatus',
  // Custom hooks pattern: any function starting with 'use' followed by uppercase
]);

function isReactHook(name) {
  if (REACT_HOOKS.has(name)) return true;
  // Match custom hooks pattern: use[A-Z]
  if (/^use[A-Z]/.test(name)) return true;
  return false;
}

function hasUseClientDirective(node) {
  if (!node || node.type !== 'Program') return false;

  // Check for 'use client' directive at the top of the file
  for (const statement of node.body) {
    // Directives are expression statements with literal string values
    if (statement.type === 'ExpressionStatement') {
      const expr = statement.expression;
      if (expr.type === 'Literal' && expr.value === 'use client') {
        return true;
      }
    } else {
      // Stop checking after first non-directive statement
      break;
    }
  }

  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require "use client" directive when using React hooks in Next.js App Router.',
    },
    schema: [],
  },
  create(context) {
    let isClientComponent = false;
    let hookUsages = [];

    return {
      Program(node) {
        isClientComponent = hasUseClientDirective(node);
        hookUsages = [];
      },
      CallExpression(node) {
        if (isClientComponent) return; // Already a client component

        // Check for hook calls: useXxx()
        if (
          node.callee.type === 'Identifier' &&
          isReactHook(node.callee.name)
        ) {
          hookUsages.push({
            node,
            name: node.callee.name,
          });
        }

        // Check for hook calls from imports: React.useXxx()
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'React' &&
          node.callee.property.type === 'Identifier' &&
          isReactHook(node.callee.property.name)
        ) {
          hookUsages.push({
            node,
            name: node.callee.property.name,
          });
        }
      },
      'Program:exit'() {
        if (isClientComponent) return;
        if (hookUsages.length === 0) return;

        // Report the first hook usage
        const firstHook = hookUsages[0];
        context.report({
          node: firstHook.node,
          message:
            'React hook "{{hookName}}" can only be used in client components. ' +
            'Add "use client" directive at the top of this file.',
          data: { hookName: firstHook.name },
        });
      },
    };
  },
};
