import ops from '../../../../../../ops/registry/capacity.json';
import spend from '../../../../../../ops/registry/spend.json';
import models from '../../../../../../scripts/backlog-orchestrator/config/model-registry.json';
import {
  type CapacityView,
  evaluateRegistry,
  routingOrder,
} from '../../../../../../scripts/lib/capacity-registry.mjs';

/** Shared fixtures for the CapacityBoard state stories and tests. */
export const CAPACITY_NOW = Date.parse('2026-10-25T02:00:00Z');
export const capacityView: CapacityView = evaluateRegistry(ops, {
  now: CAPACITY_NOW,
  spend,
  models,
});
export const capacityOrder = routingOrder(capacityView);
export const capacityRegistryUpdatedAt: string = ops.updatedAt;

/** No providers and no alerts: a registry with nothing recorded yet. */
export const emptyCapacityView: CapacityView = {
  ...capacityView,
  providers: [],
  alerts: [],
};

/** Codex with long aliases on every account and a long provider label. */
export const longCapacityView: CapacityView = {
  ...capacityView,
  providers: capacityView.providers.map(provider =>
    provider.id === 'openai-codex'
      ? {
          ...provider,
          label: `${provider.label} shared across the studio, the label and every touring laptop`,
          accounts: provider.accounts.map(account => ({
            ...account,
            aliases: [
              `${account.id}-studio-workstation-primary`,
              `${account.id}-touring-laptop-secondary`,
              `${account.id}-label-office-shared`,
            ],
          })),
        }
      : provider
  ),
};
