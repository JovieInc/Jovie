import { defineChannel, GET } from 'eve/channels';
import { APPLICATION_IDENTITY } from '../runtime-identity';
import { bindEvePilotIdentity } from '../select-identity';
export default defineChannel({ routes: [GET('/runtime/v1/health', async () => {
  const identity = bindEvePilotIdentity(APPLICATION_IDENTITY);
  return Response.json({ identity: identity.pack.id, status: 'uncommissioned',
    instructionsAvailable: identity.instructions.length > 0 }, { headers: { 'cache-control': 'no-store' } });
})] });
