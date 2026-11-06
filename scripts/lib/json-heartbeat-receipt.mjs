import { readPath } from './automation-registry.mjs';

/** Preserve producer status before checking its last successful timestamp.
 * Optional reasonPath carries a bounded public diagnostic code, never a body. */
export function projectJsonHeartbeat(receipt, read) {
  if (!read.ok) return { ok: false, reason: `json-${read.reason}` };
  const code = receipt.reasonPath && readPath(read.body, receipt.reasonPath);
  const detail =
    typeof code === 'string' && /^[a-z0-9][a-z0-9:_.+-]{0,159}$/u.test(code)
      ? `; ${code}`
      : '';
  const noProof = reason => ({
    ok: true,
    lastProofAt: null,
    reason: `${reason}${detail}`,
  });
  if (receipt.okPath) {
    const status = readPath(read.body, receipt.okPath);
    if (status === undefined || status === null)
      return noProof(`heartbeat-source-missing:${receipt.okPath}`);
    if (!(receipt.okValues ?? ['verified', 'ok', true]).includes(status))
      return noProof(`heartbeat-not-ok:${receipt.okPath}=${String(status)}`);
  }
  const value = readPath(read.body, receipt.path);
  if (value === undefined || value === null)
    return noProof(`heartbeat-source-missing:${receipt.path}`);
  return { ok: true, lastProofAt: value, url: receipt.url };
}
