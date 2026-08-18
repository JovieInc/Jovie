import { defineAgent } from 'eve';
import { bindEvePilotIdentity, eveIdentityForRuntime } from './select-identity';

export { bindEvePilotIdentity, eveIdentityForRuntime };

export default defineAgent({
  model: 'openai/gpt-5.4-mini',
});
