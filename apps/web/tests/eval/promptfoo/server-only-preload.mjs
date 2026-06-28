import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const evalProviderDir = dirname(fileURLToPath(import.meta.url));
const serverOnlyEvalShimUrl = pathToFileURL(
  resolve(evalProviderDir, 'server-only-shim.mjs')
).href;

let registered = false;

export function registerServerOnlyEvalShim() {
  if (registered) {
    return;
  }

  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'server-only') {
        return { url: serverOnlyEvalShimUrl, shortCircuit: true };
      }

      return nextResolve(specifier, context);
    },
  });

  registered = true;
}

registerServerOnlyEvalShim();
