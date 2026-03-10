/**
 * ESLint rule to prevent direct app-level db.transaction() usage.
 *
 * Canonical policy: new application code should avoid direct transaction
 * calls and use sequential/batch operations or approved wrappers.
 *
 * Bad:  await db.transaction(async (tx) => { ... });
 * Good: await db.insert(table).values([item1, item2, item3]);
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
        'Direct db.transaction() usage is restricted. Use sequential/batch operations or an approved legacy wrapper.',
    },
    schema: [],
  },
  create(context) {
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
