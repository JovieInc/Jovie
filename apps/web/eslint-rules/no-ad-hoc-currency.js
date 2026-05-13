/**
 * ESLint rule to enforce canonical currency formatter usage.
 *
 * Flags ad-hoc currency formatting in template literals where:
 * 1. A preceding quasi string ends with "$"
 * 2. AND the immediately-following expression contains a `.toFixed(` call
 *
 * Bad:  `$${(cents / 100).toFixed(2)}`
 * Bad:  `$${amount.toFixed(2)}`
 * Good: formatAmount(cents)         — @/lib/utils/format-number (takes cents)
 * Good: formatUsd(value)            — @/lib/admin/format (takes whole USD, admin only)
 */

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce canonical currency formatter (formatAmount / formatUsd) instead of ad-hoc template literals',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noAdHocCurrency:
        'Ad-hoc currency formatting detected. Use formatAmount(cents) from "@/lib/utils/format-number" for cent values, or formatUsd(value) from "@/lib/admin/format" for admin USD values.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    return {
      TemplateLiteral(node) {
        // node.quasis are the string parts; node.expressions are the interpolated values.
        // We check each expression: if the quasi immediately before it ends with "$"
        // and the expression text contains ".toFixed(", flag it.
        node.expressions.forEach((expr, i) => {
          const prevQuasi = node.quasis[i];
          if (!prevQuasi) return;

          const rawText = prevQuasi.value.raw;
          if (!rawText.endsWith('$')) return;

          const exprText = sourceCode.getText(expr);
          if (exprText.includes('.toFixed(')) {
            context.report({
              node: expr,
              messageId: 'noAdHocCurrency',
            });
          }
        });
      },
    };
  },
};
