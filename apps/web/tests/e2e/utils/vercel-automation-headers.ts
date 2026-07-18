export function vercelAutomationHeaders(): {
  readonly active: boolean;
  readonly headers: Record<string, string>;
} {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return {
    active: Boolean(secret),
    headers: secret
      ? {
          'x-vercel-protection-bypass': secret,
          'x-vercel-set-bypass-cookie': 'samesitenone',
        }
      : {},
  };
}
