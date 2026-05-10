/**
 * ESLint rule: prevent direct access to window.electronAPI outside the
 * canonical bridge module.
 *
 * Why: a stale installed desktop binary may expose only a partial bridge
 * (older preload). Direct access throws raw TypeErrors visible to users
 * (e.g. "E.onUpdateAvailable is not a function"). All access must go
 * through the guarded wrappers in lib/desktop/electron-bridge.ts which
 * check `typeof === 'function'` and capture a Sentry warning + fall back
 * to a safe no-op or download URL.
 *
 * Bad:  window.electronAPI.installUpdateAndRestart()
 * Bad:  (window as Window & { electronAPI?: ElectronAPI }).electronAPI?.foo()
 * Good: import { useDesktopUpdate } from '@/lib/desktop/electron-bridge'
 *       const { install } = useDesktopUpdate(); install();
 */

const ALLOWED_FILES = ['apps/web/lib/desktop/electron-bridge.ts'];

function unwrapTsCasts(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' || current.type === 'TSTypeAssertion')
  ) {
    current = current.expression;
  }
  return current;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct window.electronAPI access — use lib/desktop/electron-bridge.ts wrappers',
      recommended: true,
    },
    messages: {
      directAccess:
        'Direct window.electronAPI access is forbidden. The installed desktop binary may expose a partial bridge (stale preload). Import the guarded wrapper from "@/lib/desktop/electron-bridge" instead, which checks method existence and falls back gracefully.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    if (ALLOWED_FILES.some(allowed => filename.endsWith(allowed))) {
      return {};
    }

    function reportIfElectronAPIAccess(node, propertyName) {
      if (propertyName === 'electronAPI') {
        context.report({ node, messageId: 'directAccess' });
      }
    }

    return {
      // window.electronAPI / globalThis.electronAPI / self.electronAPI
      MemberExpression(node) {
        const baseObject = unwrapTsCasts(node.object);
        if (
          baseObject?.type === 'Identifier' &&
          (baseObject.name === 'window' ||
            baseObject.name === 'globalThis' ||
            baseObject.name === 'self')
        ) {
          if (node.property?.type === 'Identifier') {
            reportIfElectronAPIAccess(node, node.property.name);
          } else if (
            node.property?.type === 'Literal' &&
            typeof node.property.value === 'string'
          ) {
            reportIfElectronAPIAccess(node, node.property.value);
          }
        }
      },
    };
  },
};
