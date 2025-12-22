const NODE_ONLY_IMPORTS = new Set([
  'crypto',
  'fs',
  'fs/promises',
  'path',
  'stripe',
  'child_process',
  'os',
  'stream',
  'tls',
  'net',
  'zlib',
]);

const NODE_ONLY_PREFIXES = ['node:'];

function isNodeOnlyImport(sourceValue) {
  if (NODE_ONLY_IMPORTS.has(sourceValue)) return true;
  if (NODE_ONLY_PREFIXES.some(prefix => sourceValue.startsWith(prefix)))
    return true;

  if (sourceValue.startsWith('fs/')) return true;
  if (sourceValue.startsWith('path/')) return true;
  if (sourceValue.startsWith('crypto/')) return true;
  if (sourceValue.startsWith('stream/')) return true;

  return false;
}

function isEdgeRuntimeExport(node) {
  if (!node || node.type !== 'ExportNamedDeclaration') return false;
  const declaration = node.declaration;
  if (!declaration || declaration.type !== 'VariableDeclaration') return false;

  return declaration.declarations.some(declarator => {
    if (declarator.id.type !== 'Identifier') return false;
    if (declarator.id.name !== 'runtime') return false;
    if (!declarator.init) return false;

    if (declarator.init.type === 'Literal') {
      return declarator.init.value === 'edge';
    }

    return false;
  });
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Node-only imports in files that declare Edge runtime.',
    },
    schema: [],
  },
  create(context) {
    let isEdgeRuntime = false;

    return {
      Program(node) {
        isEdgeRuntime = node.body.some(isEdgeRuntimeExport);
      },
      ImportDeclaration(node) {
        if (!isEdgeRuntime) return;
        const sourceValue = node.source && node.source.value;
        if (typeof sourceValue !== 'string') return;
        if (!isNodeOnlyImport(sourceValue)) return;

        context.report({
          node,
          message:
            'Node-only import "{{source}}" is not allowed in Edge runtime files.',
          data: { source: sourceValue },
        });
      },
    };
  },
};
