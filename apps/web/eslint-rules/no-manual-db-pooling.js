/**
 * ESLint rule to prevent manual database pooling.
 *
 * The project uses Neon's built-in connection pooling. Manual pooling
 * via 'pg' or 'pg-pool' conflicts with this and causes connection issues.
 *
 * Bad:  import { Pool } from 'pg';
 * Bad:  import pg from 'pg';
 * Bad:  new Pool({ connectionString });
 * Good: import { db } from '@/lib/db';
 */

const FORBIDDEN_MODULES = new Set(['pg', 'pg-pool', '@types/pg']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow manual database pooling - use @/lib/db instead',
      recommended: true,
    },
    messages: {
      forbiddenImport:
        'Manual database pooling is forbidden. Import from "@/lib/db" instead of "{{module}}".',
      forbiddenPoolConstructor:
        'Manual connection pooling is forbidden. Use "import { db } from \'@/lib/db\'" instead of creating Pool instances.',
      forbiddenPoolConnect:
        'Manual pool.connect() is forbidden. Use "import { db } from \'@/lib/db\'" for all database access.',
    },
    schema: [],
  },
  create(context) {
    return {
      // Check import declarations
      ImportDeclaration(node) {
        const moduleName = node.source.value;
        if (FORBIDDEN_MODULES.has(moduleName)) {
          context.report({
            node,
            messageId: 'forbiddenImport',
            data: { module: moduleName },
          });
        }
      },

      // Check require() calls
      CallExpression(node) {
        // Check for require('pg') or require('pg-pool')
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'Literal'
        ) {
          const moduleName = node.arguments[0].value;
          if (FORBIDDEN_MODULES.has(moduleName)) {
            context.report({
              node,
              messageId: 'forbiddenImport',
              data: { module: moduleName },
            });
          }
        }
      },

      // Check for new Pool()
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Pool') {
          context.report({
            node,
            messageId: 'forbiddenPoolConstructor',
          });
        }
      },

      // Check for pool.connect()
      'CallExpression[callee.property.name="connect"]'(node) {
        const objectName =
          node.callee.object?.type === 'Identifier'
            ? node.callee.object.name
            : null;

        // Flag if called on something named 'pool'
        if (objectName && objectName.toLowerCase().includes('pool')) {
          context.report({
            node,
            messageId: 'forbiddenPoolConnect',
          });
        }
      },
    };
  },
};
