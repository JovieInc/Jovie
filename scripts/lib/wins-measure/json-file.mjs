// Read a numeric field from a committed metrics JSON file.
import { readFileSync } from 'node:fs';

/**
 * Resolve `a.b[0].c` / `a.b.0.c` against a plain object.
 * @param {unknown} root
 * @param {string} path
 */
export function readJsonPath(root, path) {
  const parts = path
    .replaceAll('[', '.')
    .replaceAll(']', '')
    .split('.')
    .filter(Boolean);
  let cur = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[part];
  }
  return cur;
}

/**
 * @param {{ file: string, path: string }} spec
 * @param {{ readFile?: (path: string, encoding?: string) => string | Buffer, cwd?: string }} [io]
 * @returns {{ value: number, evidence: string }}
 */
export function measureJsonFile(spec, io = {}) {
  const read = io.readFile ?? readFileSync;
  const filePath = spec.file;
  const raw = read(filePath, 'utf8');
  const json = JSON.parse(String(raw));
  const value = readJsonPath(json, spec.path);
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(
      `json-file ${filePath}#${spec.path}: expected finite number, got ${typeof value}`
    );
  return { value, evidence: `${filePath}#${spec.path}` };
}
