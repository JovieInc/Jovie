/**
 * ESLint rule to prevent bypassing the canonical Stripe client.
 *
 * All Stripe SDK access must go through "@/lib/stripe/client" so that
 * retry, idempotency, telemetry, and key handling stay in one place
 * (JOV-6043 architecture boundary audit).
 *
 * Bad:  import Stripe from 'stripe'; const stripe = new Stripe(key);
 * Bad:  const Stripe = require('stripe');
 * Bad:  new Stripe(process.env.STRIPE_SECRET_KEY)
 * Good: import { stripe } from '@/lib/stripe/client';
 * Good: import type Stripe from 'stripe'; // type-only imports are fine
 */

// Paths allowed to touch the Stripe SDK directly. The canonical client and
// its helpers live in lib/stripe/**; tests and scripts may construct their
// own clients for fixtures and ops tooling.
const ALLOWED_PATH_FRAGMENTS = ['/lib/stripe/', '/tests/', '/scripts/'];

const ALLOWED_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;

function isAllowedFile(filename) {
  if (!filename) {
    return false;
  }
  if (ALLOWED_FILE_PATTERN.test(filename)) {
    return true;
  }
  return ALLOWED_PATH_FRAGMENTS.some(fragment => filename.includes(fragment));
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct Stripe SDK usage outside lib/stripe - use @/lib/stripe/client instead',
      recommended: true,
    },
    messages: {
      forbiddenImport:
        'Direct runtime import of "stripe" bypasses the canonical client. Use "import { stripe } from \'@/lib/stripe/client\'" instead (type-only imports are allowed).',
      forbiddenRequire:
        'Direct require("stripe") bypasses the canonical client. Use "import { stripe } from \'@/lib/stripe/client\'" instead.',
      forbiddenConstructor:
        'Do not construct a Stripe client outside lib/stripe. Use "import { stripe } from \'@/lib/stripe/client\'" so retry/idempotency policy stays centralized.',
    },
    schema: [],
  },
  create(context) {
    const filename = (
      context.filename ||
      (typeof context.getFilename === 'function' ? context.getFilename() : '')
    ).replaceAll('\\', '/');

    if (isAllowedFile(filename)) {
      return {};
    }

    let stripeImportedAsValue = false;

    return {
      ImportDeclaration(node) {
        const moduleName = node.source.value;
        if (
          moduleName !== 'stripe' &&
          !(typeof moduleName === 'string' && moduleName.startsWith('stripe/'))
        ) {
          return;
        }
        // `import type Stripe from 'stripe'` is safe — no runtime access.
        if (node.importKind === 'type') {
          return;
        }
        // `import { type Event } from 'stripe'` is also type-only in practice,
        // but a mixed specifier list still performs a runtime import; flag it.
        stripeImportedAsValue = true;
        context.report({ node, messageId: 'forbiddenImport' });
      },

      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'Literal'
        ) {
          const moduleName = node.arguments[0].value;
          if (moduleName === 'stripe' || moduleName.startsWith?.('stripe/')) {
            context.report({ node, messageId: 'forbiddenRequire' });
          }
        }
      },

      NewExpression(node) {
        // Catch `new Stripe(...)` even if the import slipped through an
        // indirect path (barrel re-export, namespace alias).
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Stripe' &&
          stripeImportedAsValue
        ) {
          context.report({ node, messageId: 'forbiddenConstructor' });
        }
      },
    };
  },
};
