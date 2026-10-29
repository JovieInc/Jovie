import { readFile } from 'node:fs/promises';
import { parsePipelineBottleneck } from './pipeline-bottleneck.ts';

/** Read only: the external collector retains sole ownership of the state file. */
export async function readPipelineBottleneck(path: string | undefined) {
  if (!path) return null;
  try {
    return parsePipelineBottleneck(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}
