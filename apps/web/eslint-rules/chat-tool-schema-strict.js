/**
 * Require chat tool input schemas to use chatToolSchema() instead of bare z.object().
 */

const CHAT_TOOL_SCHEMA_FILES = ['/lib/chat/', '/app/api/chat/'];

function isChatToolSchemaFile(filename) {
  return CHAT_TOOL_SCHEMA_FILES.some(segment => filename.includes(segment));
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require chat tool input schemas to use chatToolSchema() for strict validation',
    },
    schema: [],
    messages: {
      useChatToolSchema:
        'Chat tool input schemas must use chatToolSchema() instead of z.object() so unknown keys are rejected.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    if (!isChatToolSchemaFile(filename)) {
      return {};
    }

    return {
      Property(node) {
        if (
          node.key?.type !== 'Identifier' ||
          node.key.name !== 'inputSchema' ||
          node.value?.type !== 'CallExpression'
        ) {
          return;
        }

        const callee = node.value.callee;
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.name === 'z' &&
          callee.property?.name === 'object'
        ) {
          context.report({ node: node.value, messageId: 'useChatToolSchema' });
        }
      },
      VariableDeclarator(node) {
        if (
          node.id?.type !== 'Identifier' ||
          !node.id.name.endsWith('Schema') ||
          node.init?.type !== 'CallExpression'
        ) {
          return;
        }

        const callee = node.init.callee;
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.name === 'z' &&
          callee.property?.name === 'object'
        ) {
          context.report({ node: node.init, messageId: 'useChatToolSchema' });
        }
      },
    };
  },
};
