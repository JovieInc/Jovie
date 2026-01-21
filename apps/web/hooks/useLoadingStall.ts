'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to detect when a loading operation is taking longer than expected.
 * Returns true when `isLoaded` has been false for longer than `stallTimeoutMs`.
 *
 * @param isLoaded - Whether the resource has finished loading
 * @param stallTimeoutMs - Time in ms before showing stall message (default: 4000)
 * @returns Whether the loading is considered stalled
 *
 * @example
 * ```tsx
 * const { isLoaded } = useClerk();
 * const isStalled = useLoadingStall(isLoaded);
 *
 * if (!isLoaded) {
 *   return (
 *     <div>
 *       <Spinner />
 *       {isStalled && <p>Taking longer than usual...</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useLoadingStall(
  isLoaded: boolean,
  stallTimeoutMs = 4000
): boolean {
  const [isStalled, setIsStalled] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setIsStalled(false);
      return undefined;
    }

    const timeout = setTimeout(() => {
      setIsStalled(true);
    }, stallTimeoutMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [isLoaded, stallTimeoutMs]);

  return isStalled;
}
