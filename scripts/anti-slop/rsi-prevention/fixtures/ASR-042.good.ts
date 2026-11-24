/** Legitimate counterexample: bounded retry/backoff off the success path (ASR-042). */
export async function fetchWithBackoff(attempt: number) {
  if (attempt <= 0) return;
  // Documented failure-path backoff — not a success/paint delay.
  const delayMs = Math.min(1000, 50 * 2 ** attempt);
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

export function debounceSearch(run: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
}
