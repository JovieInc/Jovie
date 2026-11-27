import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityHoverLink, type EntityPopoverData } from './EntityPopover';

const release = {
  kind: 'release',
  id: 'rel_1',
  label: 'Sober',
  artist: 'Jovie',
  releaseType: 'Single',
} satisfies EntityPopoverData;

afterEach(() => {
  vi.useRealTimers();
});

describe('EntityHoverLink certificate', () => {
  it('activates the linked artist from the card and stays axe-clean', async () => {
    vi.useFakeTimers();
    const onActivate = vi.fn();
    fastRender(
      <EntityHoverLink entity={release} onActivate={onActivate}>
        Sober
      </EntityHoverLink>
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Sober' }));
    act(() => {
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    await expectNoA11yViolations(screen.getByRole('tooltip'));

    fireEvent.click(screen.getByRole('button', { name: 'Jovie' }));
    expect(onActivate).toHaveBeenCalledWith({
      kind: 'artist',
      id: 'artist:Jovie',
      label: 'Jovie',
    });
  });
});
