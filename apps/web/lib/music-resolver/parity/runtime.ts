/** Compare the running Node version with the repo `.nvmrc` pin. */
export function nodeMatchesNvmrc(running: string, required: string): boolean {
  return running.trim().replace(/^v/, '') === required.trim();
}
