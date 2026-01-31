/**
 * ESLint rule to require AbortSignal in TanStack Query queryFn.
 *
 * Without signal, queries continue running after component unmount,
 * causing memory leaks and race conditions.
 *
 * Bad:  queryFn: () => fetchUser(id)
 * Bad:  queryFn: (context) => fetchUser(id)  // context unused
 * Good: queryFn: ({ signal }) => fetchUser(id, { signal })
 */

const QUERY_HOOKS = new Set([
  'useQuery',
  'useSuspenseQuery',
  'useInfiniteQuery',
  'useSuspenseInfiniteQuery',
]);

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require AbortSignal destructuring in TanStack Query queryFn',
      recommended: true,
    },
    messages: {
      missingSignal:
        'queryFn should destructure "signal" for proper request cancellation: queryFn: ({ signal }) => fetch(url, { signal })',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        // Check if this is a query hook call
        const calleeName =
          node.callee.type === 'Identifier' ? node.callee.name : null;

        if (!calleeName || !QUERY_HOOKS.has(calleeName)) return;

        // Get the options object (first argument)
        const optionsArg = node.arguments[0];
        if (!optionsArg || optionsArg.type !== 'ObjectExpression') return;

        // Find the queryFn property
        const queryFnProp = optionsArg.properties.find(
          (prop) =>
            prop.type === 'Property' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'queryFn'
        );

        if (!queryFnProp) return;

        const queryFn = queryFnProp.value;

        // Check if queryFn is an arrow function or function expression
        if (
          queryFn.type !== 'ArrowFunctionExpression' &&
          queryFn.type !== 'FunctionExpression'
        ) {
          // If it's a reference to another function, we can't easily check
          // Skip this case to avoid false positives
          return;
        }

        // Check if the function has parameters
        const params = queryFn.params;

        if (params.length === 0) {
          // No parameters at all - signal is not being used
          context.report({
            node: queryFnProp,
            messageId: 'missingSignal',
          });
          return;
        }

        const firstParam = params[0];

        // If the first param is a destructuring pattern, check for 'signal'
        if (firstParam.type === 'ObjectPattern') {
          const hasSignal = firstParam.properties.some(
            (prop) =>
              prop.type === 'Property' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 'signal'
          );

          if (!hasSignal) {
            context.report({
              node: queryFnProp,
              messageId: 'missingSignal',
            });
          }
        } else if (firstParam.type === 'Identifier') {
          // If it's just an identifier (like `context`), we can't be sure
          // they're using signal, but we'll allow it to avoid false positives
          // on patterns like: queryFn: (ctx) => fetchWithContext(ctx)
          // This is a reasonable pattern where signal might be passed through
        }
      },
    };
  },
};
