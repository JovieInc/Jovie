import { defineAgent } from 'eve';
import {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  eveIdentityForChannel,
  eveIdentityForRuntime,
} from './select-identity';

/** Bind the Jovie/Ovie pack when Eve loads this agent. */
export const evePilotIdentity = eveIdentityForRuntime();

export {
  assertEvePilotFactoryLock,
  bindEvePilotIdentity,
  eveIdentityForChannel,
  eveIdentityForRuntime,
};

export default defineAgent({
  model: 'openai/gpt-5.4-mini',
});
