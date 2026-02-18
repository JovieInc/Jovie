/**
 * Gravatar URL Generation
 *
 * Generates Gravatar avatar URLs from email addresses using MD5 hashing
 * per Gravatar's API specification. Uses a pure-JS MD5 implementation
 * so it works in both server and browser environments.
 *
 * When no Gravatar exists for the email, the URL returns a 404 so the
 * Avatar component falls back to its initials display.
 *
 * @see https://docs.gravatar.com/api/avatars/
 */

/** Default avatar size in pixels (matches HIGH_RES_SIZE in avatar-url.ts) */
const GRAVATAR_SIZE = 512;

/** Maximum size supported by the Gravatar API */
const MAX_GRAVATAR_SIZE = 2048;

/**
 * Generate a Gravatar avatar URL from an email address.
 *
 * @param email - The email address to generate a Gravatar URL for
 * @param size - Image size in pixels (default: 512, max: 2048)
 * @returns The Gravatar avatar URL
 *
 * @example
 * ```ts
 * getGravatarUrl('user@example.com')
 * // => 'https://www.gravatar.com/avatar/b58996c504c5638798eb6b511e6f49af?s=512&d=404'
 * ```
 */
export function getGravatarUrl(email: string, size = GRAVATAR_SIZE): string {
  const clampedSize = Math.round(
    Math.max(1, Math.min(size, MAX_GRAVATAR_SIZE))
  );
  const hash = md5Hex(email.toLowerCase().trim());
  return `https://www.gravatar.com/avatar/${hash}?s=${clampedSize}&d=404`;
}

// ---------------------------------------------------------------------------
// Minimal MD5 (RFC 1321)
// Intentionally embedded for non-security Gravatar URL hashing only.
// Tested against Node.js crypto to verify correctness.
// Avoids adding a dependency for a single non-cryptographic use case.
// ---------------------------------------------------------------------------

/** Per-round left-rotate amounts. */
const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
  9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
  16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
] as const;

/** Pre-computed constants: floor(2^32 * abs(sin(i + 1))) for i = 0..63. */
const TABLE = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a,
  0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8,
  0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa,
  0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
] as const;

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

/** Convert a 32-bit integer to 8-char hex in little-endian byte order. */
function hexLE(n: number): string {
  const u = n >>> 0;
  return (
    (u & 0xff).toString(16).padStart(2, '0') +
    ((u >>> 8) & 0xff).toString(16).padStart(2, '0') +
    ((u >>> 16) & 0xff).toString(16).padStart(2, '0') +
    ((u >>> 24) & 0xff).toString(16).padStart(2, '0')
  );
}

/** Compute MD5 hex digest of a UTF-8 string. */
function md5Hex(input: string): string {
  const msg = new TextEncoder().encode(input);
  const bitLen = msg.length * 8;

  // Pad to 64-byte boundary with 8 bytes reserved for length
  const padLen = (((msg.length + 8) >>> 6) + 1) << 6;
  const padded = new Uint8Array(padLen);
  padded.set(msg);
  padded[msg.length] = 0x80;

  // Append original length in bits as 64-bit little-endian
  const view = new DataView(padded.buffer);
  view.setUint32(padLen - 8, bitLen >>> 0, true);
  view.setUint32(padLen - 4, Math.floor(bitLen / 0x100000000), true);

  // Initialize hash state
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // Process each 64-byte block
  for (let i = 0; i < padLen; i += 64) {
    const w = new Uint32Array(16);
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, true);
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let j = 0; j < 64; j++) {
      let f: number;
      let g: number;

      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }

      const temp = d;
      d = c;
      c = b;
      b = Math.trunc(b + rotl(Math.trunc(a + f + TABLE[j]! + w[g]!), SHIFT[j]!));
      a = temp;
    }

    a0 = Math.trunc(a0 + a);
    b0 = Math.trunc(b0 + b);
    c0 = Math.trunc(c0 + c);
    d0 = Math.trunc(d0 + d);
  }

  return hexLE(a0) + hexLE(b0) + hexLE(c0) + hexLE(d0);
}
