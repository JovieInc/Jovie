import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { Repository } = createRequire(require.resolve('nextra/package.json'))(
  '@napi-rs/simple-git'
);
const appRoot = fileURLToPath(new URL('../', import.meta.url));

test('Nextra resolves document history paths inside the linked worktree', () => {
  const repository = Repository.discover(appRoot);
  const source = readFileSync(
    new URL(
      './dist/server/loader.js',
      import.meta.resolve('nextra/package.json')
    ),
    'utf8'
  );
  const expression = source.match(/^const GIT_ROOT = (.+);$/m)?.[1];
  assert.ok(
    expression,
    'The installed Nextra loader must expose its Git root calculation'
  );
  const root = runInNewContext(expression, { repository, path });
  assert.equal(
    path.relative(root, path.join(appRoot, 'app/layout.tsx')),
    path.join('apps', 'docs', 'app', 'layout.tsx')
  );
});
