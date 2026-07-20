export function vercelAutomationHeaders(): {
  readonly active: boolean;
  readonly headers: Record<string, string>;
} {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (secret) {
    throw new Error(
      'Global Vercel bypass headers are forbidden; use the origin-bound cookie bootstrap.'
    );
  }
  return {
    active: false,
    headers: {},
  };
}
