/**
 * ESLint rule to prevent server-only imports in client components.
 *
 * This rule detects when a file with 'use client' directive imports
 * server-only modules that would cause runtime errors or security issues.
 */

const SERVER_ONLY_IMPORTS = new Set([
  'server-only',
  '@clerk/nextjs/server',
  '@neondatabase/serverless',
  'drizzle-orm',
  'drizzle-orm/neon-serverless',
  'stripe',
  'resend',
]);

const SERVER_ONLY_PATH_PATTERNS = [
  /^@\/lib\/db(?:\/|$)/, // @/lib/db/*
  /^@\/lib\/auth\/session$/,
  /^@\/lib\/auth\/cached$/,
  /^@\/lib\/auth\/gate$/,
  /^@\/lib\/env-server/,
  /^@\/lib\/stripe\/client$/,
  /^@\/lib\/admin\//, // @/lib/admin/*
  /\.server$/, // *.server.ts files
];

function isServerOnlyImport(sourceValue) {
  if (SERVER_ONLY_IMPORTS.has(sourceValue)) return true;

  for (const pattern of SERVER_ONLY_PATH_PATTERNS) {
    if (pattern.test(sourceValue)) return true;
  }

  return false;
}

function hasUseClientDirective(node) {
  if (!node || node.type !== 'Program') return false;

  // Check for 'use client' directive at the top of the file
  for (const statement of node.body) {
    // Directives are expression statements with literal string values
    if (statement.type === 'ExpressionStatement') {
      const expr = statement.expression;
      if (
        expr.type === 'Literal' &&
        (expr.value === 'use client' || expr.value === "'use client'")
      ) {
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
        'Disallow server-only imports in files with "use client" directive.',
    },
    schema: [],
  },
  create(context) {
    let isClientComponent = false;

    return {
      Program(node) {
        isClientComponent = hasUseClientDirective(node);
      },
      ImportDeclaration(node) {
        if (!isClientComponent) return;

        const sourceValue = node.source && node.source.value;
        if (typeof sourceValue !== 'string') return;
        if (!isServerOnlyImport(sourceValue)) return;

        context.report({
          node,
          message:
            'Server-only import "{{source}}" cannot be used in client components. ' +
            'Remove the import or remove "use client" if this should be a server component.',
          data: { source: sourceValue },
        });
      },
    };
  },
};
