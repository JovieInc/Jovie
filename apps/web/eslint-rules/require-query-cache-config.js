/**
 * ESLint rule to require cache configuration in TanStack Query hooks.
 *
 * Without explicit staleTime/gcTime, queries use aggressive defaults
 * that cause unnecessary API calls and poor performance.
 *
 * Bad:  useQuery({ queryKey: ['user'], queryFn: fetchUser });
 * Good: useQuery({ queryKey: ['user'], queryFn: fetchUser, staleTime: 5 * 60 * 1000 });
 * Good: useQuery({ queryKey: ['user'], queryFn: fetchUser, ...STABLE_CACHE });
 */

const QUERY_HOOKS = new Set([
  'useQuery',
  'useSuspenseQuery',
  'useInfiniteQuery',
  'useSuspenseInfiniteQuery',
]);

// Properties that indicate cache configuration
const CACHE_CONFIG_PROPERTIES = new Set([
  'staleTime',
  'gcTime',
  'cacheTime', // Legacy name for gcTime
]);

// Spread patterns that likely contain cache config
const CACHE_PRESET_PATTERNS = [
  /CACHE/i,
  /cacheConfig/i,
  /queryOptions/i,
];

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require staleTime/gcTime configuration in TanStack Query hooks',
      recommended: true,
    },
    messages: {
      missingCacheConfig:
        'useQuery calls should specify staleTime for cache control. Use a cache preset from lib/queries/cache.ts or set staleTime explicitly.',
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

        // Check if any cache config property exists
        let hasCacheConfig = false;

        for (const prop of optionsArg.properties) {
          // Check for direct cache properties
          if (
            prop.type === 'Property' &&
            prop.key.type === 'Identifier' &&
            CACHE_CONFIG_PROPERTIES.has(prop.key.name)
          ) {
            hasCacheConfig = true;
            break;
          }

          // Check for spread operators that might contain cache config
          if (prop.type === 'SpreadElement') {
            const spreadArg = prop.argument;
            // If spreading a variable that looks like a cache preset, assume it has config
            if (spreadArg.type === 'Identifier') {
              const name = spreadArg.name;
              if (CACHE_PRESET_PATTERNS.some((pattern) => pattern.test(name))) {
                hasCacheConfig = true;
                break;
              }
            }
          }
        }

        if (!hasCacheConfig) {
          context.report({
            node,
            messageId: 'missingCacheConfig',
          });
        }
      },
    };
  },
};
