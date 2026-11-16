/** Process ownership stays strict unless the caller presents the issued manual token. */
export function ownsLease(lease, holder, token = undefined) {
  return (
    lease?.holder === holder &&
    (lease.token
      ? Boolean(token) && token === lease.token
      : lease.pid === process.pid)
  );
}
