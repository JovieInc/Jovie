/**
 * ESLint rule to prevent hardcoded route paths.
 *
 * Routes should be imported from constants/routes.ts to prevent typos,
 * enable safe refactoring, and maintain consistency.
 *
 * Bad:  const url = '/app/dashboard/audience';
 * Bad:  router.push('/app/settings/billing');
 * Good: import { APP_ROUTES } from '@/constants/routes';
 *       const url = APP_ROUTES.AUDIENCE;
 */

// Patterns that indicate hardcoded app routes
const HARDCODED_ROUTE_PATTERNS = [
  /^\/app\/dashboard\//,
  /^\/app\/settings\//,
  /^\/app\/admin\//,
  /^\/dashboard\//,
  /^\/settings\//,
  /^\/admin\//,
];

// Files where hardcoded routes are allowed (route definitions, tests, middleware)
const ALLOWED_FILES = [
  'constants/routes.ts',
  'constants/routes.js',
  '.test.ts',
  '.test.tsx',
  '.spec.ts',
  '.spec.tsx',
  'proxy.ts',
  'middleware.ts',
];

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow hardcoded route paths - use constants/routes.ts instead',
      recommended: true,
    },
    messages: {
      hardcodedRoute:
        'Hardcoded route "{{route}}" detected. Import from "constants/routes.ts" instead (e.g., APP_ROUTES.AUDIENCE).',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();

    // Skip allowed files
    if (ALLOWED_FILES.some((pattern) => filename.includes(pattern))) {
      return {};
    }

    return {
      Literal(node) {
        // Only check string literals
        if (typeof node.value !== 'string') return;

        const value = node.value;

        // Check if it matches any hardcoded route pattern
        const isHardcodedRoute = HARDCODED_ROUTE_PATTERNS.some((pattern) =>
          pattern.test(value)
        );

        if (isHardcodedRoute) {
          context.report({
            node,
            messageId: 'hardcodedRoute',
            data: { route: value },
          });
        }
      },

      TemplateLiteral(node) {
        // Check template literals that start with route patterns
        if (node.quasis.length > 0) {
          const firstQuasi = node.quasis[0].value.raw;
          const isHardcodedRoute = HARDCODED_ROUTE_PATTERNS.some((pattern) =>
            pattern.test(firstQuasi)
          );

          if (isHardcodedRoute) {
            context.report({
              node,
              messageId: 'hardcodedRoute',
              data: { route: firstQuasi + '...' },
            });
          }
        }
      },
    };
  },
};
