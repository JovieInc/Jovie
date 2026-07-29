import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const scriptPath = join(
  repoRoot,
  'apps/ios/scripts/capture-memory-baseline.sh'
);

test('iOS memory baseline keeps non-strict memgraph capture honest', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(
    source,
    /REQUIRE_MEMGRAPH="\$\{JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH:-0\}"/
  );
  assert.match(source, /MEMGRAPH_CREATED/);
  assert.match(source, /Developer Tools security/);
  assert.match(source, /Set JOVIE_IOS_MEMORY_REQUIRE_MEMGRAPH=1/);
});

test('iOS memory baseline writes into the retained artifact path and strict mode fails', async () => {
  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /artifacts\/ios-test-results\/memory-baseline/);
  assert.match(source, /REQUIRE_MEMGRAPH.*==.*1/);
  assert.match(source, /exit 1/);
});

test('iOS package command remains wired to the capture script', async () => {
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, 'package.json'), 'utf8')
  );
  assert.equal(
    packageJson.scripts['ios:memory'],
    'bash apps/ios/scripts/capture-memory-baseline.sh'
  );
});
