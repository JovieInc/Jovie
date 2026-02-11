import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('middleware convention', () => {
  const projectRoot = resolve(__dirname, '..', '..');
  const proxyPath = resolve(projectRoot, 'proxy.ts');
  const middlewarePath = resolve(projectRoot, 'middleware.ts');

  it('has proxy.ts with middleware logic', () => {
    expect(existsSync(proxyPath)).toBe(true);
  });

  it('has middleware.ts that re-exports from proxy.ts', () => {
    expect(existsSync(middlewarePath)).toBe(true);
    const content = readFileSync(middlewarePath, 'utf-8');
    expect(content).toContain("from './proxy'");
  });
});
