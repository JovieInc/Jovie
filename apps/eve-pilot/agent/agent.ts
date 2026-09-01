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
  // Summer's shadow is a low-frequency operations governor. Expensive audits
  // are delegated through an explicit, budgeted dispatch path rather than
  // spending a frontier model on ordinary receipt interpretation.
  model: 'zai/glm-5.3-flash',
  // Pin the Gateway-published 1M window so the Eve compiler does not need a
  // network metadata lookup during an offline build or smoke test.
  modelContextWindowTokens: 1_000_000,
  reasoning: 'minimal',
  limits: {
    // A full shadow session costs only fractions of a cent at the selected
    // model's current Gateway list pricing. A deployment-level Gateway budget
    // remains required before external traffic is enabled.
    maxInputTokensPerSession: 30_000,
    maxOutputTokensPerSession: 6_000,
    sessionTimeoutMs: 24 * 60 * 60 * 1_000,
  },
});
