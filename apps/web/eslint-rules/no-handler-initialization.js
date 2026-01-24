/**
 * ESLint rule to prevent expensive resource initialization inside handler functions.
 *
 * Serverless best practice: Initialize expensive resources (database connections,
 * SDK clients, etc.) at module scope, not inside request handlers. This ensures
 * resources are reused across requests within the same function instance.
 *
 * Bad:  export async function POST() { const stripe = new Stripe(...); }
 * Good: const stripe = getStripe(); // module-level singleton
 */

const FORBIDDEN_CONSTRUCTORS = new Set([
  'Stripe',
  'Pool',
  'Webhook',
  'Resend',
  'Client', // Generic SDK clients
]);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow initializing expensive resources inside HTTP handler functions',
    },
    schema: [],
  },
  create(context) {
    let insideExportedHandler = false;

    return {
      // Match: export async function POST/GET/etc
      'ExportNamedDeclaration > FunctionDeclaration'(node) {
        const name = node.id?.name;
        if (
          node.async &&
          ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(
            name
          )
        ) {
          insideExportedHandler = true;
        }
      },
      'ExportNamedDeclaration > FunctionDeclaration:exit'(node) {
        const name = node.id?.name;
        if (
          ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(
            name
          )
        ) {
          insideExportedHandler = false;
        }
      },
      NewExpression(node) {
        if (!insideExportedHandler) return;

        const calleeName = node.callee?.name;
        if (calleeName && FORBIDDEN_CONSTRUCTORS.has(calleeName)) {
          context.report({
            node,
            message: `Do not instantiate "${calleeName}" inside request handlers. Use a module-level singleton instead to avoid cold start overhead and enable connection reuse.`,
          });
        }
      },
    };
  },
};
