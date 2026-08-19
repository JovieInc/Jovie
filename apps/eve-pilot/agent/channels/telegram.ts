import {
  defaultTelegramAuth,
  telegramChannel,
  type TelegramContext,
  type TelegramInboundResult,
  type TelegramMessage,
} from 'eve/channels/telegram';

import { admitOvieTelegramMessage } from '../lib/telegram-allowlist';
import { bindEvePilotIdentity } from '../select-identity';

/**
 * Telegram is a fallback talk channel to the same Ovie identity. It is not
 * Jovie artist mode and not Summer-as-door.
 */
export function onOvieTelegramMessage(
  _ctx: TelegramContext,
  message: TelegramMessage
): TelegramInboundResult {
  if (!admitOvieTelegramMessage(message)) return null;

  const auth = defaultTelegramAuth(message);
  if (!auth) return null;

  const turn = bindEvePilotIdentity('ovie');
  return {
    auth: {
      ...auth,
      attributes: {
        ...auth.attributes,
        fallback: 'true',
        identity: 'ovie',
        source: 'telegram',
      },
    },
    context: [turn.instructions],
  };
}

export default telegramChannel({
  botUsername: process.env.OVIE_TELEGRAM_BOT_USERNAME?.replace(/^@/, ''),
  onMessage: onOvieTelegramMessage,
});
