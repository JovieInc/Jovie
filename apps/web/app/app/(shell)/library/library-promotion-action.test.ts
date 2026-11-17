import { expect, it, vi } from 'vitest';
import { buildPrivatePromotionAction } from './library-promotion-action';

it('opens the selected eligible work without offering draft or archived releases', () => {
  const open = vi.fn();
  const work = { id: 'release-1', status: 'released' } as const;
  buildPrivatePromotionAction(work, 'owner', open)?.onExecute?.();
  expect(open).toHaveBeenCalledWith('/app/library?promotion=release-1');
  expect(
    buildPrivatePromotionAction({ ...work, status: 'draft' }, 'owner', open)
  ).toBeNull();
  expect(
    buildPrivatePromotionAction(
      { ...work, lifecycleStatus: 'archived' },
      'owner',
      open
    )
  ).toBeNull();
  expect(buildPrivatePromotionAction(work, null, open)).toBeNull();
});
