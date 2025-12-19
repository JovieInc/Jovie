module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when critical UI files do not include data-testid attributes.',
    },
    schema: [],
  },
  create(context) {
    let hasTestId = false;
    let hasJsx = false;

    return {
      JSXElement() {
        hasJsx = true;
      },
      JSXFragment() {
        hasJsx = true;
      },
      JSXAttribute(node) {
        if (node.name && node.name.name === 'data-testid') {
          hasTestId = true;
        }
      },
      'Program:exit'(node) {
        if (hasJsx && !hasTestId) {
          context.report({
            node,
            message:
              'Critical UI should expose at least one data-testid selector.',
          });
        }
      },
    };
  },
};
