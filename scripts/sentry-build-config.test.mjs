import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const configPath = new URL('../apps/web/next.config.js', import.meta.url);
const source = readFileSync(configPath, 'utf8');
const realRequire = createRequire(configPath);
function load(env) {
  let sentryOptions;
  let base;
  const context = {
    process: { env },
    __dirname: new URL('../apps/web', import.meta.url).pathname,
    module: { exports: {} },
    require(name) {
      if (name === '@next/bundle-analyzer') return () => config => config;
      if (name === 'workflow/next')
        return {
          withWorkflow(config) {
            base = config;
            return config;
          },
        };
      if (name === '@vercel/toolbar/plugins/next')
        return () => config => config;
      if (name === '@sentry/nextjs/config')
        return {
          withSentryConfig(config, options) {
            sentryOptions = options;
            return config;
          },
        };
      return realRequire(name);
    },
  };
  vm.runInNewContext(source, context, { filename: configPath.pathname });
  return { config: base, sentryOptions };
}
for (const token of [undefined, '', '[SENSITIVE]', '   ', ' [SENSITIVE]\n']) {
  test(`does not emit browser maps or enable uploads with unusable token ${String(token)}`, () => {
    const { config, sentryOptions } = load({
      NODE_ENV: 'production',
      SENTRY_AUTH_TOKEN: token,
    });
    assert.equal(config.productionBrowserSourceMaps, false);
    assert.equal(sentryOptions, undefined);
  });
}
for (const env of [
  { NODE_ENV: 'production' },
  { NODE_ENV: 'development', VERCEL_ENV: 'preview' },
]) {
  test(`emits upload-only maps for ${JSON.stringify(env)}`, () => {
    const { config, sentryOptions } = load({
      ...env,
      SENTRY_AUTH_TOKEN: 'test-fixture-token',
    });
    assert.equal(config.productionBrowserSourceMaps, true);
    assert.equal(sentryOptions.sourcemaps.deleteSourcemapsAfterUpload, true);
    assert.equal(sentryOptions.widenClientFileUpload, true);
  });
}
test('local development does not emit maps even with an upload token', () => {
  const { config, sentryOptions } = load({
    NODE_ENV: 'development',
    SENTRY_AUTH_TOKEN: 'test-fixture-token',
  });
  assert.equal(config.productionBrowserSourceMaps, false);
  assert.equal(sentryOptions, undefined);
});
