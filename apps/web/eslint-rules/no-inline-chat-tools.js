const ALLOWED_FILE = '/app/api/chat/route.ts';

function isToolCall(node) {
  return node?.type === 'CallExpression' && node.callee?.name === 'tool';
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow inline tool implementations in the main chat route',
      recommended: true,
    },
    messages: {
      inlineToolBuilder:
        'Do not define inline chat tool builders in app/api/chat/route.ts. Move the tool implementation into lib/chat/tools/* and import it here.',
      inlineToolExecute:
        'Do not add inline tool execute handlers in app/api/chat/route.ts. Import a tool builder from lib/chat/tools/* instead.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    if (!filename.endsWith(ALLOWED_FILE)) {
      return {};
    }

    return {
      FunctionDeclaration(node) {
        if (
          typeof node.id?.name === 'string' &&
          /^create[A-Z].*Tool$/.test(node.id.name)
        ) {
          context.report({ node, messageId: 'inlineToolBuilder' });
        }
      },
      CallExpression(node) {
        if (!isToolCall(node)) {
          return;
        }

        const firstArg = node.arguments[0];
        if (
          firstArg?.type === 'ObjectExpression' &&
          firstArg.properties.some(
            property =>
              property.type === 'Property' &&
              property.key.type === 'Identifier' &&
              property.key.name === 'execute'
          )
        ) {
          context.report({ node, messageId: 'inlineToolExecute' });
        }
      },
    };
  },
};
