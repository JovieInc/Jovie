/**
 * ESLint rule to enforce readonly modifiers on React component props
 *
 * This rule ensures all properties in interfaces/types ending with "Props"
 * have the readonly modifier, enforcing immutability at the type level.
 *
 * @example
 * // ✅ Correct
 * interface MyProps {
 *   readonly name: string;
 *   readonly age?: number;
 * }
 *
 * // ❌ Incorrect
 * interface MyProps {
 *   name: string;
 *   age?: number;
 * }
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce readonly modifiers on React component props',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',
    messages: {
      missingReadonly:
        'Props property "{{property}}" must have readonly modifier',
    },
    schema: [], // no options
  },
  create(context) {
    return {
      TSInterfaceDeclaration(node) {
        // Only check interfaces ending with "Props"
        if (!node.id.name.endsWith('Props')) {
          return;
        }

        // Check each property in the interface body
        node.body.body.forEach(property => {
          // Only check property signatures (not methods, call signatures, etc.)
          if (property.type !== 'TSPropertySignature') {
            return;
          }

          // Skip if already readonly
          if (property.readonly) {
            return;
          }

          // Report the missing readonly modifier
          const propertyName =
            property.key.name ||
            property.key.value ||
            (property.key.type === 'Literal' ? property.key.value : 'unknown');

          context.report({
            node: property,
            messageId: 'missingReadonly',
            data: { property: propertyName },
            fix(fixer) {
              // Add readonly before the property
              return fixer.insertTextBefore(property, 'readonly ');
            },
          });
        });
      },

      // Also check type aliases
      TSTypeAliasDeclaration(node) {
        // Only check types ending with "Props"
        if (!node.id.name.endsWith('Props')) {
          return;
        }

        // Only check if it's an object type literal
        if (node.typeAnnotation.type !== 'TSTypeLiteral') {
          return;
        }

        // Check each property
        node.typeAnnotation.members.forEach(property => {
          if (property.type !== 'TSPropertySignature') {
            return;
          }

          if (property.readonly) {
            return;
          }

          const propertyName =
            property.key.name ||
            property.key.value ||
            (property.key.type === 'Literal' ? property.key.value : 'unknown');

          context.report({
            node: property,
            messageId: 'missingReadonly',
            data: { property: propertyName },
            fix(fixer) {
              return fixer.insertTextBefore(property, 'readonly ');
            },
          });
        });
      },
    };
  },
};
