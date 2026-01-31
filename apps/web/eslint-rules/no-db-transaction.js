/**
 * ESLint rule to prevent db.transaction() usage with Neon HTTP driver.
 *
 * The Neon HTTP driver does not support interactive transactions.
 * Use batch operations (db.insert().values([...items])) or sequential
 * operations instead.
 *
 * Bad:  await db.transaction(async (tx) => { ... });
 * Good: await db.insert(table).values([item1, item2, item3]);
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow db.transaction() - incompatible with Neon HTTP driver',
      recommended: true,
    },
    messages: {
      noTransaction:
        'db.transaction() is not supported with Neon HTTP driver. Use batch operations (db.insert().values([...items])) or sequential operations instead.',
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
