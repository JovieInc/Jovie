import {
  decideRecoveryUnlatch,
  RECOVERY_UNLATCH_POLL_MS,
} from './renderer-recovery';

export function createRecoveryUnlatchController(input: {
  readonly findReachableHostedUrl: (
    url: string,
    signal: AbortSignal
  ) => Promise<string | null>;
  readonly getHostedUrl: () => string;
  readonly isWindowDestroyed: () => boolean;
  readonly isRendererBooted: () => boolean;
  readonly reloadHosted: (url: string) => void;
}) {
  let generation = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;
  const stop = (): void => {
    generation += 1;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    inFlight?.abort();
    inFlight = null;
  };

  return {
    begin(): void {
      stop();
      if (disposed) return;
      const currentGeneration = generation;
      const isCurrent = () =>
        !disposed &&
        generation === currentGeneration &&
        !input.isWindowDestroyed() &&
        !input.isRendererBooted();
      const poll = async (): Promise<void> => {
        if (!isCurrent()) return;
        timer = null;
        const probe = new AbortController();
        inFlight = probe;
        let reachableHostedUrl: string | null = null;
        try {
          reachableHostedUrl = await input.findReachableHostedUrl(
            input.getHostedUrl(),
            probe.signal
          );
        } catch {
          // A current failure keeps the existing fallback; stopped work is stale.
        } finally {
          if (inFlight === probe) inFlight = null;
        }
        // Cancellation alone is insufficient when a probe ignores its signal.
        if (!isCurrent()) return;
        const action = decideRecoveryUnlatch({
          // Begin can precede the failure data: URL commit; navigation stops it.
          showingFailurePage: true,
          booted: input.isRendererBooted(),
          windowDestroyed: input.isWindowDestroyed(),
          reachableHostedUrl,
        });
        if (action === 'reload-hosted' && reachableHostedUrl) {
          input.reloadHosted(reachableHostedUrl);
          return;
        }
        timer = setTimeout(() => void poll(), RECOVERY_UNLATCH_POLL_MS);
      };
      void poll();
    },
    stop,
    dispose(): void {
      disposed = true;
      stop();
    },
  };
}
