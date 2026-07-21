import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('launch-electron gates CDP behind JOVIE_DEV and binds loopback', async () => {
  const source = await readFile(
    join(desktopRoot, 'scripts/launch-electron.mjs'),
    'utf8'
  );

  assert.match(source, /process\.env\.JOVIE_DEV === '1'/);
  assert.match(source, /JOVIE_ELECTRON_CDP_PORT/);
  assert.match(source, /--remote-debugging-port=\$\{port\}/);
  assert.match(source, /--remote-debugging-address=127\.0\.0\.1/);
  assert.doesNotMatch(source, /--remote-debugging-port=9224/);
});

test('desktop dev script routes through launch-electron', async () => {
  const packageJson = await readFile(join(desktopRoot, 'package.json'), 'utf8');
  assert.match(
    packageJson,
    /"dev": "tsc && node scripts\/launch-electron\.mjs"/
  );
});

test('launch-electron strips a leading -- separator from extra args', async () => {
  const source = await readFile(
    join(desktopRoot, 'scripts/launch-electron.mjs'),
    'utf8'
  );

  assert.match(source, /process\.argv\.slice\(2\)/);
  assert.match(source, /rawArgs\[0\] === '--'/);
  assert.match(source, /rawArgs\.slice\(1\)/);
});
