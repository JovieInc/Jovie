import { APP_ROUTES } from '@/constants/routes';
import type { OvieCompanyTile } from '@/lib/ovie/home/company-tiles';
import { countLabel, type OUpdateSpec } from '@/lib/ovie/o-updates';
import type { HudShippingSnapshot } from './useHudShippingStateQuery';

/**
 * What counts as a change for the O's update reveal, per query. Pure: each
 * function compares two reads and counts items that actually differ.
 */

/** PRs merged since the previous read. */
export const shippedUpdate: OUpdateSpec<HudShippingSnapshot> = {
  key: 'ovie.shipped',
  label: countLabel('change shipped', 'changes shipped'),
  href: APP_ROUTES.ADMIN_SHIPPING,
  countChanged: (previous, next) => {
    const seen = new Set(
      (previous.view.delivery.merges.recent ?? []).map(
        pr => `${pr.repo}#${pr.number}`
      )
    );
    return (next.view.delivery.merges.recent ?? []).filter(
      pr => !seen.has(`${pr.repo}#${pr.number}`)
    ).length;
  },
};

/** Linear tasks that arrived or moved to another workflow state. */
export const linearUpdate: OUpdateSpec<HudShippingSnapshot> = {
  key: 'ovie.linear',
  label: countLabel('task moved', 'tasks moved'),
  href: APP_ROUTES.ADMIN_SHIPPING,
  countChanged: (previous, next) => {
    const before = new Map(
      previous.operationalTasks.tasks.map(task => [task.id, task.workflowState])
    );
    return next.operationalTasks.tasks.filter(
      task => before.get(task.id) !== task.workflowState
    ).length;
  },
};

/** Home glance tiles whose measured value changed. */
export const homeGlanceUpdate: OUpdateSpec<readonly OvieCompanyTile[]> = {
  key: 'ovie.home-glance',
  label: countLabel('number changed', 'numbers changed'),
  href: APP_ROUTES.ADMIN,
  countChanged: (previous, next) => {
    const before = new Map(previous.map(tile => [tile.key, tile.value]));
    return next.filter(
      tile =>
        tile.measured &&
        before.has(tile.key) &&
        before.get(tile.key) !== tile.value
    ).length;
  },
};
