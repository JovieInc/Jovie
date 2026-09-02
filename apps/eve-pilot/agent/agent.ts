import { defineAgent } from 'eve';
import {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  eveIdentityForChannel,
  eveIdentityForRuntime,
} from './select-identity';

/** Bind the Jovie/Ovie/Summer pack when Eve loads this agent. */
export const evePilotIdentity = eveIdentityForRuntime();

export {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  eveIdentityForChannel,
  eveIdentityForRuntime,
};

export default defineAgent({
  // Root settings apply to every channel in this Eve app. Keep the proven
  // Jovie/Ovie model here; the read-only Summer identity is selected only by
  // its explicit channel source and must not change unrelated sessions.
  model: 'openai/gpt-5.4-mini',
});
