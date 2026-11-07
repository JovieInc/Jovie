/**
 * Fragment form of a device proof: `<device>.<unix ts>.<hex proof>`. Kept free
 * of node:crypto so the client connect page can import it.
 */
export function parseProofFragment(
  fragment: string
): { device: string; ts: number; proof: string } | null {
  const match =
    /^#?([a-z0-9][a-z0-9-]{1,39})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(fragment);
  if (!match) return null;
  return { device: match[1]!, ts: Number(match[2]), proof: match[3]! };
}
