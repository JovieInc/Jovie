import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export const OVERNIGHT_SCRIPT_ROOT = SCRIPT_DIR;
export const OVERNIGHT_WEB_ROOT = resolve(SCRIPT_DIR, '..', '..');
export const OVERNIGHT_REPO_ROOT = resolve(OVERNIGHT_WEB_ROOT, '..', '..');
