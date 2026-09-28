import { defineAgent } from 'eve';
import { EVE_PILOT_COMPACTION_THRESHOLD_PERCENT } from './lib/context-budget';
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
  // Eve Gateway OIDC speaker for this isolated pilot. GLM 5.3 Flash is
  // already wired (`zai/glm-5.3-flash`); do not buy keys. Photon/iMessage
  // binds Ovie; Summer is not this root model.
  model: 'zai/glm-5.3-flash',
  // Bound replayed history (~60K tokens) instead of compacting near the 1M-token window.
  compaction: { thresholdPercent: EVE_PILOT_COMPACTION_THRESHOLD_PERCENT },
});
