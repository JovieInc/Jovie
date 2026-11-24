/** Deliberate-red sample text for ASR-042 (not a typechecked module). */
// Matcher target: intentional stream pacing on the success path.
export const paced = "smoothStream({ delayInMs: 15, chunking: 'word' })";

export async function paintGate() {
  await new Promise(resolve => setTimeout(resolve, 15));
  return 'ready';
}
