/**
 * ESLint rule to prevent direct app-level db.transaction() usage.
 *
 * Multi-statement business invariants use runAtomicDbOperation.
 *
 * Bad:  await db.transaction(async (tx) => { ... });
 * Good: await runAtomicDbOperation(operation, options);
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct db.transaction() usage in app code',
      recommended: true,
    },
    messages: {
      noTransaction:
        'Use runAtomicDbOperation for multi-statement invariants; direct transactions bypass certification.',
    },
    schema: [],
  },
  create(context) {
    if (
      context.filename
        .replaceAll('\\', '/')
        .endsWith('/lib/db/legacy-transaction.ts')
    )
      return {};
    return {
      CallExpression(node) {
        // Match: *.transaction( or db.transaction(
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'transaction'
        ) {
          // The canonical driver adapter owns checkout/release (including BEGIN
          // failure). Permit only its client-bound forwarding call, not app
          // transactions or other transaction calls in the connection module.
          const receiver = node.callee.object;
          if (
            context.filename
              .replaceAll('\\', '/')
              .endsWith('/lib/db/client/connection.ts') &&
            receiver.type === 'CallExpression' &&
            receiver.callee.type === 'Identifier' &&
            receiver.callee.name === 'createDbInstance' &&
            receiver.arguments.length === 1 &&
            node.arguments.length === 2 &&
            [receiver.arguments[0], ...node.arguments].every(
              (argument, index) =>
                argument.type === 'Identifier' &&
                argument.name === ['client', 'operation', 'config'][index]
            )
          )
            return;
          // Check if the object is likely a db instance
          const objectName =
            node.callee.object.type === 'Identifier'
              ? node.callee.object.name
              : null;

          // Flag if it's called on 'db' or 'tx' (transaction context)
          // or if we can't determine the object (be conservative)
          if (
            objectName === 'db' ||
            objectName === 'tx' ||
            objectName === null
          ) {
            context.report({
              node,
              messageId: 'noTransaction',
            });
          }
        }
      },
    };
  },
};
