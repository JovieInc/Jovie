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
  // Summer is the live Photon/iMessage speaker on this Eve app. GLM 5.3 Flash
  // is already on Eve Gateway OIDC (`zai/glm-5.3-flash`); do not buy keys.
  model: 'zai/glm-5.3-flash',
});
