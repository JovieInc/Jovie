import 'server-only';

import { env } from '@/lib/env-server';

export interface StatsigGateCheckResult {
  name: string;
  value: boolean;
  rule_id: string | null;
  group_name: string | null;
}

type StatsigGateCheckResponse = {
  name?: unknown;
  value?: unknown;
  rule_id?: unknown;
  group_name?: unknown;
};

export async function checkStatsigGateForUser(
  gateName: string,
  user: { userID: string }
): Promise<boolean> {
  const apiKey = env.STATSIG_SERVER_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch('https://api.statsig.com/v1/check_gate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'statsig-api-key': apiKey,
      },
      body: JSON.stringify({ gateName, user }),
      cache: 'no-store',
    });

    if (!res.ok) return false;

    const payload = (await res
      .json()
      .catch(() => null)) as StatsigGateCheckResponse | null;

    return Boolean(payload?.value === true);
  } catch {
    return false;
  }
}
