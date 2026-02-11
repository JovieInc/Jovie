import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('middleware convention', () => {
  const projectRoot = resolve(__dirname, '..', '..');
  const proxyPath = resolve(projectRoot, 'proxy.ts');
  const middlewarePath = resolve(projectRoot, 'middleware.ts');

  it('uses proxy.ts and does not include middleware.ts', () => {
    const hasProxy = existsSync(proxyPath);
    const hasMiddleware = existsSync(middlewarePath);

    expect(hasProxy).toBe(true);
    expect(hasMiddleware).toBe(false);
  });
});
