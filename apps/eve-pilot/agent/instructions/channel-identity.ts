import { defineDynamic, defineInstructions } from 'eve/instructions';
import { bindEvePilotIdentity } from '../select-identity';

const CHANNEL_SOURCES = new Set(['imessage', 'telegram']);

/**
 * Photon and Telegram bind their identity pack once per session as system
 * context. Channel `context` is appended to history as a user message, so
 * returning the pack from `onMessage` re-sent it on every message.
 */
export function channelIdentityInstructionsForAttributes(
  attributes: Readonly<Record<string, unknown>> | undefined
) {
  if (typeof attributes?.source !== 'string') return null;
  if (!CHANNEL_SOURCES.has(attributes.source)) return null;
  const identity = attributes.identity;
  if (identity !== 'jovie' && identity !== 'summer') return null;

  const { instructions } = bindEvePilotIdentity(identity);
  return instructions ? defineInstructions({ content: instructions }) : null;
}

export default defineDynamic({
  events: {
    'session.started'(_event, ctx) {
      return channelIdentityInstructionsForAttributes(
        ctx.session.auth.current?.attributes
      );
    },
  },
});
