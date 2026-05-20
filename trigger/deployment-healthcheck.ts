import { task } from '@trigger.dev/sdk';

export const deploymentHealthcheck = task({
  id: 'deployment-healthcheck',
  run: async () => ({ ok: true }),
});
