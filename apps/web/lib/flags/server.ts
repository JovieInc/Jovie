import 'server-only';

import type { StatsigFlagName } from '@/lib/flags';
import { checkStatsigGateForUser } from '@/lib/statsig/server';

export async function checkGateForUser(
  gateName: StatsigFlagName,
  user: { userID: string }
): Promise<boolean> {
  return checkStatsigGateForUser(gateName, user);
}
