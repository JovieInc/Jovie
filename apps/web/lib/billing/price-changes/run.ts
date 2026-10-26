import 'server-only';

import {
  buildPriceChangeNotice,
  dbRecipientPort,
  resendMailPort,
  sentryIncidentPort,
} from './adapters';
import { DrizzleNoticeStore } from './drizzle-store';
import { SCHEDULED_PRICE_CHANGES } from './registry';
import { stripePriceChangePort } from './stripe-port';
import { type ChangeSweepResult, runPriceChangeSweep } from './sweep';

/**
 * Cron entry. Sending real notices and switching real subscriptions are two
 * explicit switches, both off unless set to "true" (development never emails a
 * real person or touches a subscription).
 */
export async function runPriceChangeSweepFromCron(): Promise<{
  changes: number;
  sendEnabled: boolean;
  applyEnabled: boolean;
  results: ChangeSweepResult[];
}> {
  const sendEnabled = process.env.PRICE_CHANGE_NOTICE_SEND_ENABLED === 'true';
  const applyEnabled = process.env.PRICE_CHANGE_APPLY_ENABLED === 'true';
  if (SCHEDULED_PRICE_CHANGES.length === 0) {
    return { changes: 0, sendEnabled, applyEnabled, results: [] };
  }
  const results = await runPriceChangeSweep(
    {
      store: new DrizzleNoticeStore(),
      stripe: stripePriceChangePort,
      recipients: dbRecipientPort,
      mail: resendMailPort,
      incidents: sentryIncidentPort,
      buildNotice: buildPriceChangeNotice,
      now: () => new Date(),
      sendEnabled,
      applyEnabled,
    },
    SCHEDULED_PRICE_CHANGES
  );
  return { changes: results.length, sendEnabled, applyEnabled, results };
}
