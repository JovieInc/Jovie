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
