import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-6700: Ovie's shipping view read the retired Symphony Elixir on a
 * loopback port and a Gem-local state file. Neither exists on Vercel, so the
 * Delivery card read "Unknown" while lanes were full. Production web source
 * must not reach for either again.
 */
const webRoot = path.resolve(import.meta.dirname, '../../..');
const sourceDirs = [
  'app',
  'components',
  'contexts',
  'hooks',
  'lib',
  'workflows',
];
const productionSource = /\.(?:ts|tsx|mts)$/;
const ignored =
  /\.d\.ts$|[./](?:test|spec|stories)\.[cm]?[tj]sx?$|\/(?:__tests__|fixtures)\//;

// Built from parts so this guard does not match itself.
const RETIRED_SYMPHONY_PORT = ['127.0.0.1', '4041'].join(':');
const RETIRED_SYMPHONY_HOST = ['localhost', '4041'].join(':');
const GEM_LOCAL_STATE = ['gem', 'workspace'].join('-');

function productionFiles(dir: string, out: string[] = []): string[] {
  const absolute = path.join(webRoot, dir);
  if (!fs.existsSync(absolute)) return out;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) productionFiles(relative, out);
    else if (productionSource.test(relative) && !ignored.test(relative)) {
      out.push(relative);
    }
  }
  return out;
}

describe('shipping-state dead source guard', () => {
  it(
    'has no production reference to the retired Symphony port or Gem-local state',
    { timeout: 60_000 },
    () => {
      const offenders = sourceDirs
        .flatMap(dir => productionFiles(dir))
        .filter(file => {
          const source = fs.readFileSync(path.join(webRoot, file), 'utf8');
          return (
            source.includes(RETIRED_SYMPHONY_PORT) ||
            source.includes(RETIRED_SYMPHONY_HOST) ||
            source.includes(GEM_LOCAL_STATE)
          );
        });
      expect(offenders).toEqual([]);
    }
  );

  it('keeps the shipping-state data layer off the local filesystem', () => {
    const files = [
      ...productionFiles('lib/ovie/shipping-state'),
      'lib/ovie/shipping-state-client.ts',
      'lib/hud/ovie-mac-hud.ts',
      'lib/hud/ovie-mac-hud.server.ts',
      'app/api/hud/shipping-state/route.ts',
    ];
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter(file =>
      /from ['"]node:(?:fs|fs\/promises|os)['"]|\bhomedir\(/.test(
        fs.readFileSync(path.join(webRoot, file), 'utf8')
      )
    );
    expect(offenders).toEqual([]);
  });
});
