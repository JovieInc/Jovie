import {
  defaultTelegramAuth,
  type TelegramContext,
  type TelegramInboundResult,
  type TelegramMessage,
  telegramChannel,
} from 'eve/channels/telegram';

import { admitOvieTelegramMessage } from '../lib/telegram-allowlist';
import { bindEvePilotIdentity } from '../select-identity';

/**
 * Telegram is a private fallback presentation surface for Summer. Ovie is
 * never instantiated as an identity or runtime.
 */
export function onSummerTelegramMessage(
  _ctx: TelegramContext,
  message: TelegramMessage
): TelegramInboundResult {
  if (!admitOvieTelegramMessage(message)) return null;

  const auth = defaultTelegramAuth(message);
  if (!auth) return null;

  const turn = bindEvePilotIdentity('summer');
  return {
    auth: {
      ...auth,
      attributes: {
        ...auth.attributes,
        fallback: 'true',
        identity: 'summer',
        presentation: 'ovie',
        source: 'telegram',
      },
    },
    context: [turn.instructions],
  };
}

export default telegramChannel({
  botUsername: process.env.OVIE_TELEGRAM_BOT_USERNAME?.replace(/^@/, ''),
  onMessage: onSummerTelegramMessage,
});
