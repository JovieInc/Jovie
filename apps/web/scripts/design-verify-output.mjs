import { mkdir, rm } from 'node:fs/promises';

export const DESIGN_VERIFY_OUTPUT_DIR = '/tmp/design-verify';

export async function resetDesignVerifyOutputDirectory() {
  await rm(DESIGN_VERIFY_OUTPUT_DIR, { force: true, recursive: true });
  await mkdir(DESIGN_VERIFY_OUTPUT_DIR, { recursive: true });
}
