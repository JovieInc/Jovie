/** Deliberate-red: intentional stream pacing on the success path (ASR-042). */
import { smoothStream } from 'ai';

export const paced = smoothStream({ delayInMs: 15, chunking: 'word' });

export async function paintGate() {
  await new Promise(resolve => setTimeout(resolve, 15));
  return 'ready';
}
