/**
 * Every way a vanished stdout consumer surfaces on the stdio streams, across
 * platforms and timings (JOV-13096): POSIX writes to a closed reader give
 * EPIPE, Windows gives EOF, and a write that races the stream's own teardown
 * gives ERR_STREAM_DESTROYED or ERR_STREAM_WRITE_AFTER_END. All of them mean
 * "output is gone", never "the CLI failed".
 */

/** A closed pipe (`jovie ... | head`) ends output, not the process with a trace. */
export function isClosedPipeError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined | null)?.code;
  return (
    code === 'EPIPE' ||
    code === 'EOF' ||
    code === 'ERR_STREAM_DESTROYED' ||
    code === 'ERR_STREAM_WRITE_AFTER_END'
  );
}

export function closedPipeListener(
  exit: (code: number) => void
): (error: NodeJS.ErrnoException) => void {
  return error => {
    if (isClosedPipeError(error)) {
      exit(Number(process.exitCode ?? 0));
      return;
    }
    throw error;
  };
}
