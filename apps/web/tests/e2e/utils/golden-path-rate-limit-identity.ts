function hashIdentity(value: string, seed: number): number {
  let hash = seed;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Give each locally armed golden-path request a real, isolated rate-limit
 * identity without disabling any abuse controls. 2001:db8::/32 is reserved
 * for documentation and cannot identify a production client.
 */
export function createGoldenPathTestIp(
  githubRunId: string | undefined,
  testIdentity: string
): string {
  const identity = `${githubRunId || 'local'}:${testIdentity}`;
  const first = hashIdentity(identity, 2_166_136_261);
  const second = hashIdentity(identity, 2_166_136_261 ^ 0x9e3779b9);
  const segments = [
    first >>> 16,
    first & 0xffff,
    second >>> 16,
    second & 0xffff,
  ].map(segment => segment.toString(16));

  return `2001:db8:${segments.join(':')}::1`;
}
