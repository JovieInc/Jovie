/**
 * Resolve a writable path for the E1 attestation-observations receipt.
 * Gem self-hosted runners (timwhite) cannot mkdir /opt/cursor — prefer
 * E1_RECEIPT_PATH, then RUNNER_TEMP, then /opt/cursor/artifacts when writable,
 * else os.tmpdir().
 */

import { constants as fsConstants } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const E1_RECEIPT_NAME = 'e1-attestation-observations-receipt.json';
export const OPT_CURSOR_E1_RECEIPT = `/opt/cursor/artifacts/${E1_RECEIPT_NAME}`;

export async function resolveE1ReceiptPath(
  env: NodeJS.ProcessEnv = process.env
): Promise<string> {
  if (env.E1_RECEIPT_PATH) return env.E1_RECEIPT_PATH;
  if (env.RUNNER_TEMP) {
    return join(env.RUNNER_TEMP, E1_RECEIPT_NAME);
  }
  try {
    await access('/opt/cursor/artifacts', fsConstants.W_OK);
    return OPT_CURSOR_E1_RECEIPT;
  } catch {
    try {
      await mkdir('/opt/cursor/artifacts', { recursive: true });
      return OPT_CURSOR_E1_RECEIPT;
    } catch {
      return join(tmpdir(), E1_RECEIPT_NAME);
    }
  }
}
