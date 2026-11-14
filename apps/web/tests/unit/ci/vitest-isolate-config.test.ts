/**
 * Scenario tests for the merge-time VITEST_ISOLATE switch.
 *
 * The resolved isolation setting must be CLI-authoritative, and the setup
 * file's VITEST_ISOLATION_OFF flag must mirror the RESOLVED setting — so:
 * unset/true keep isolation on and inject no cleanup flag, false resolves
 * isolation off and injects it, and CLI --isolate/--no-isolate overrides win
 * over the env string. Isolate:true runs register no extra cleanup because
 * the setup file gates on this flag.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it, vi } from 'vitest';

const configHref = pathToFileURL(
  path.resolve(__dirname, '../../../vitest.config.fast.mts')
).href;

type LoadedFastConfig = {
  default: {
    test: {
      isolate: boolean;
      env: Record<string, string | undefined>;
    };
  };
};

async function loadFastConfig(
  argv: string[],
  vitestIsolate?: string
): Promise<LoadedFastConfig> {
  const prevArgv = process.argv;
  const prevEnv = process.env.VITEST_ISOLATE;
  process.argv = ['node', 'vitest', ...argv];
  if (vitestIsolate === undefined) {
    delete process.env.VITEST_ISOLATE;
  } else {
    process.env.VITEST_ISOLATE = vitestIsolate;
  }
  try {
    vi.resetModules();
    return (await import(configHref)) as LoadedFastConfig;
  } finally {
    process.argv = prevArgv;
    if (prevEnv === undefined) {
      delete process.env.VITEST_ISOLATE;
    } else {
      process.env.VITEST_ISOLATE = prevEnv;
    }
    vi.resetModules();
  }
}

it('unset env and no CLI flag keep isolation on and inject no cleanup flag', async () => {
  const config = await loadFastConfig([]);
  expect(config.default.test.isolate).toBe(true);
  expect(config.default.test.env.VITEST_ISOLATION_OFF).toBeUndefined();
});

it('VITEST_ISOLATE=false resolves isolation off and injects the cleanup flag', async () => {
  const config = await loadFastConfig([], 'false');
  expect(config.default.test.isolate).toBe(false);
  expect(config.default.test.env.VITEST_ISOLATION_OFF).toBe('true');
});

it('VITEST_ISOLATE=true keeps isolation on with no cleanup flag', async () => {
  const config = await loadFastConfig([], 'true');
  expect(config.default.test.isolate).toBe(true);
  expect(config.default.test.env.VITEST_ISOLATION_OFF).toBeUndefined();
});

it('a --no-isolate CLI override wins over the unset env (resolved off)', async () => {
  const config = await loadFastConfig(['--no-isolate']);
  expect(config.default.test.isolate).toBe(false);
  expect(config.default.test.env.VITEST_ISOLATION_OFF).toBe('true');
});

it('a --isolate=true CLI override wins over VITEST_ISOLATE=false (resolved on)', async () => {
  const config = await loadFastConfig(['--isolate=true'], 'false');
  expect(config.default.test.isolate).toBe(true);
  expect(config.default.test.env.VITEST_ISOLATION_OFF).toBeUndefined();
});
