/**
 * Safely decode the `x-vercel-ip-city` header.
 *
 * Vercel sends city values percent-encoded (e.g. `S%C3%A3o%20Paulo`). A bare
 * `decodeURIComponent` throws `URIError` on malformed sequences, and a spoofed
 * or truncated header (`%E0%A4`, `%`, etc.) would otherwise bubble up to the
 * outer try/catch and turn into a 500 — including AFTER an OTP has already
 * been consumed in verify-otp, which would block the legitimate user from
 * receiving their download links.
 *
 * Returns the decoded city, or the trimmed raw value if decoding fails, or
 * `null` for missing/empty headers. Never throws.
 */
export function decodeCityHeader(rawCity: string | null): string | null {
  if (rawCity == null) return null;
  const trimmed = rawCity.trim();
  if (trimmed.length === 0) return null;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    // Malformed percent-encoding — fall back to the raw value rather than 500.
    return trimmed;
  }
}
