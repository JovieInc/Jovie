import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPipelineBottleneck } from '../packages/agent-transport-contracts/pipeline-bottleneck.node.ts';
import { rankPipelineBottlenecks } from '../packages/agent-transport-contracts/pipeline-bottleneck.ts';

/** One hourly-loop iteration; no scheduler, provider calls, or state-file writes. */
export async function runPipelineBottleneckLoop(path: string | undefined) {
  const state = await readPipelineBottleneck(path);
  return state ? { ...state, ranking: rankPipelineBottlenecks(state) } : null;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const state = await runPipelineBottleneckLoop(process.argv[2]);
  if (state) {
    process.stdout.write(`${JSON.stringify(state)}\n`);
  } else {
    process.stderr.write(
      'Pipeline bottleneck snapshot unavailable or invalid\n'
    );
    process.exitCode = 1;
  }
}
