import assert from 'node:assert/strict';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import {
  DESIGN_VERIFY_OUTPUT_DIR,
  resetDesignVerifyOutputDirectory,
} from './design-verify-output.mjs';

test('resetDesignVerifyOutputDirectory replaces stale output with an empty directory', async () => {
  const staleFile = join(DESIGN_VERIFY_OUTPUT_DIR, 'stale.png');

  try {
    await rm(DESIGN_VERIFY_OUTPUT_DIR, { force: true, recursive: true });
    await mkdir(DESIGN_VERIFY_OUTPUT_DIR);
    await writeFile(staleFile, 'stale screenshot');

    await resetDesignVerifyOutputDirectory();

    await access(DESIGN_VERIFY_OUTPUT_DIR);
    await assert.rejects(readFile(staleFile), error => error.code === 'ENOENT');
  } finally {
    await rm(DESIGN_VERIFY_OUTPUT_DIR, { force: true, recursive: true });
  }
});
