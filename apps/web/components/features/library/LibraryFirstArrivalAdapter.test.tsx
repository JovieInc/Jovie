import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advanceCacheGeneration,
  applyCacheScope,
  getCacheGeneration,
  resetCacheIsolationForTests,
} from '@/lib/queries/cache-isolation';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type ArrivalProjection,
  type ArrivalRowActions,
  type ArrivalRowsPresentation,
  LibraryFirstArrivalAdapter,
  type LibraryFirstArrivalAdapterProps,
  useLibraryFirstArrivalActions,
} from './LibraryFirstArrivalAdapter';

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reduced.value,
}));
const scope = {
  userId: 'fixture-user',
  tenantId: 'fixture-tenant',
  identityId: 'artist-identity',
};
const context = () => ({
  userId: scope.userId,
  profileId: 'owned-profile',
  sessionId: 'fixture-session',
  impersonationSubject: null,
  generation: getCacheGeneration(),
});
/** Narrow DTO emitted by reviewed core2933dc98: claim + active run + partial snapshot. */
function partial(): ArrivalProjection {
  return {
    context: context(),
    state: {
      scope,
      activeRun: 'spotify-import-1',
      revision: 1,
      importedIds: ['release-1'],
    },
    view: {
      showIntroduction: true,
      availableCount: 1,
      source: 'spotify',
      scopeComplete: false,
      fullCatalogComplete: false,
      status: 'partial',
      metric: null,
      motionIds: ['release-1'],
      interactionBlocked: false,
    },
  };
}
class VisibilityObserver {
  static instances: VisibilityObserver[] = [];
  readonly targets = new Set<Element>();
  observations = 0;
  constructor(readonly callback: IntersectionObserverCallback) {
    VisibilityObserver.instances.push(this);
  }
  observe = (node: Element) => {
    this.observations += 1;
    this.targets.add(node);
  };
  unobserve = (node: Element) => {
    this.targets.delete(node);
  };
  disconnect = () => {
    this.targets.clear();
  };
  emit(node: Element, visible = true) {
    this.callback(
      [
        {
          target: node,
          isIntersecting: visible,
          intersectionRect: {
            width: visible ? 120 : 0,
            height: visible ? 32 : 0,
          },
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  }
}
function releaseButton() {
  return screen.getByRole('button', { name: 'Open actual release' });
}
let shown: ArrivalRowsPresentation;
let actions: ArrivalRowActions;
function FixtureRows() {
  const callbacks = useLibraryFirstArrivalActions();
  useLayoutEffect(() => {
    actions = callbacks;
  }, [callbacks]);
  return (
    <>
      <button
        type='button'
        ref={node => callbacks.onCommittedRow('release-1', node)}
      >
        Open actual release
      </button>
      <button {...callbacks.skipButtonProps}>Skip introduction</button>
    </>
  );
}
function renderRows(value: ArrivalRowsPresentation) {
  shown = value;
  return <FixtureRows />;
}

function mount(overrides: Partial<LibraryFirstArrivalAdapterProps> = {}) {
  const props = {
    scope,
    context: context(),
    projection: partial(),
    onEvent: vi.fn(),
    children: renderRows,
    ...overrides,
  };
  return { ...render(<LibraryFirstArrivalAdapter {...props} />), props };
}
const proposal = {
  exact_earned_moment:
    'A committed release becomes visible after a durable first-use grant.',
  user_outcome: 'Find the newly available release.',
  static_or_functional_insufficiency:
    'Bound synthetic regression input, not production evidence.',
  expected_material_improvement: 'Synthetic policy-positive fixture only.',
  invasiveness_and_repetition_risk: 'One bounded batch, no routine replay.',
  reduced_motion_and_static_behavior: 'Immediate static usable rows.',
  approved_archetype_or_exception:
    'Synthetic gate fixture, not founder approval.',
};
const benefitReceipt = Object.freeze({
  verified: true as const,
  source: 'synthetic-test-only',
});
beforeEach(() => {
  resetCacheIsolationForTests();
  applyCacheScope({
    userId: scope.userId,
    profileId: 'owned-profile',
    sessionId: 'fixture-session',
    ready: true,
  });
  reduced.value = false;
  VisibilityObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', VisibilityObserver);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetCacheIsolationForTests();
});

describe('LibraryFirstArrivalAdapter', () => {
  it('renders the introduction rows and the no-projection fallback without a11y violations', async () => {
    const withIntro = mount();
    await expectNoA11yViolations(withIntro.container);
    withIntro.unmount();

    const fallback = mount({ projection: null, onEvent: undefined });
    await expectNoA11yViolations(fallback.container);
  });
  it('keeps rows usable and unknown metrics null when authoritative ports are absent', () => {
    mount({ projection: null, onEvent: undefined });
    expect(releaseButton()).toBeEnabled();
    expect(shown.showIntroduction).toBe(false);
    expect(shown.availableCount).toBeNull();
    expect(shown.metric).toBeNull();
    expect(shown.motionIds).toEqual([]);
    expect(VisibilityObserver.instances).toHaveLength(0);
  });
  it('does not turn a source preview or count into committed visible content', () => {
    const projection = partial();
    const { props } = mount({
      projection: {
        ...projection,
        state: { ...projection.state, importedIds: [] },
        view: {
          ...projection.view,
          availableCount: 0,
          status: 'pending',
          source: null,
          motionIds: [],
        },
      },
    });
    expect(shown.fullCatalogComplete).toBe(false);
    expect(shown.sourceComplete).toBe(false);
    expect(shown.availableCount).toBeNull();
    expect(shown.status).toBeNull();
    expect(shown.showIntroduction).toBe(false);
    expect(props.onEvent).not.toHaveBeenCalled();
    expect(VisibilityObserver.instances).toHaveLength(0);
  });
  it('keeps an otherwise eligible canonical projection static without its event port', () => {
    mount({ onEvent: undefined });
    expect(shown.availableCount).toBe(1);
    expect(shown.status).toBe('partial');
    expect(shown.showIntroduction).toBe(false);
    expect(shown.eventDelivery).toBe('unavailable');
    expect(shown.motionIds).toEqual([]);
    expect(VisibilityObserver.instances).toHaveLength(0);
  });
  it('emits content-visible once only after a committed connected row intersects', () => {
    const { props } = mount();
    const io = VisibilityObserver.instances.at(-1)!;
    const node = releaseButton();
    expect(props.onEvent).not.toHaveBeenCalled();
    act(() => io.emit(node, false));
    expect(props.onEvent).not.toHaveBeenCalled();
    act(() => {
      io.emit(node);
      io.emit(node);
    });
    expect(props.onEvent).toHaveBeenCalledExactlyOnceWith(
      { type: 'content-visible', scope },
      context()
    );
  });
  it('registers a new committed revision and rejects retained handlers from the prior one', () => {
    const { props, rerender, unmount } = mount();
    const previousObserver = VisibilityObserver.instances.at(-1)!;
    const previousNavigation = actions.onNavigateAway;
    const row = releaseButton();
    const projection = partial();
    rerender(
      <LibraryFirstArrivalAdapter
        {...props}
        projection={{
          ...projection,
          state: { ...projection.state, revision: 2 },
        }}
      />
    );
    const currentObserver = VisibilityObserver.instances.at(-1)!;
    expect(currentObserver).not.toBe(previousObserver);
    expect(currentObserver.targets.has(row)).toBe(true);
    act(() => {
      previousNavigation();
      previousObserver.emit(row);
    });
    expect(props.onEvent).not.toHaveBeenCalled();
    act(() => currentObserver.emit(row));
    expect(props.onEvent).toHaveBeenCalledExactlyOnceWith(
      { type: 'content-visible', scope },
      context()
    );
    const currentNavigation = actions.onNavigateAway;
    unmount();
    act(() => currentNavigation());
    expect(props.onEvent).toHaveBeenCalledOnce();
  });
  it.each(['hidden', 'inert', 'aria-hidden'])(
    'rejects a row under a %s ancestor until a fresh visible observation',
    attribute => {
      const { props, container } = mount();
      const ancestor = container.firstElementChild!;
      const row = releaseButton();
      const io = VisibilityObserver.instances.at(-1)!;
      ancestor.setAttribute(
        attribute,
        attribute === 'aria-hidden' ? 'true' : ''
      );
      act(() => io.emit(row));
      expect(props.onEvent).not.toHaveBeenCalled();
      ancestor.removeAttribute(attribute);
      act(() => io.emit(row));
      expect(props.onEvent).toHaveBeenCalledOnce();
    }
  );
  it('rejects a hidden document and reobserves connected rows when it becomes foreground', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('visible');
    const { props } = mount();
    const row = releaseButton();
    const io = VisibilityObserver.instances.at(-1)!;
    const initial = io.observations;
    visibility.mockReturnValue('hidden');
    act(() => io.emit(row));
    expect(props.onEvent).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    expect(io.observations).toBeGreaterThan(initial);
    act(() => io.emit(row));
    expect(props.onEvent).toHaveBeenCalledOnce();
  });
  it('rejects a removed virtualized node and does not mistake unrelated content for a row', () => {
    const { props, rerender } = mount();
    const old = releaseButton();
    const io = VisibilityObserver.instances.at(-1)!;
    rerender(
      <LibraryFirstArrivalAdapter {...props}>
        {value => {
          shown = value;
          return <button type='button'>Unrelated count: 1</button>;
        }}
      </LibraryFirstArrivalAdapter>
    );
    act(() => {
      io.emit(old);
      io.emit(screen.getByRole('button'));
    });
    expect(props.onEvent).not.toHaveBeenCalled();
  });
  it('fails quiet without IntersectionObserver rather than consuming by count', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { props } = mount();
    expect(shown.showIntroduction).toBe(false);
    expect(shown.motionIds).toEqual([]);
    expect(props.onEvent).not.toHaveBeenCalled();
  });
  it('rejects cross-tenant core projections while keeping current rows available', () => {
    const projection = partial();
    const { props } = mount({
      projection: {
        ...projection,
        state: {
          ...projection.state,
          scope: { ...scope, tenantId: 'other-tenant' },
        },
      },
    });
    expect(shown.availableCount).toBeNull();
    fireEvent.pointerDown(releaseButton());
    expect(props.onEvent).not.toHaveBeenCalled();
  });
  it('does not equate core identityId with profileId, and fences stale profile/cache callbacks', () => {
    const { props } = mount();
    expect(shown.availableCount).toBe(1);
    const io = VisibilityObserver.instances.at(-1)!;
    const node = releaseButton();
    act(() => {
      advanceCacheGeneration('manual');
      io.emit(node);
    });
    expect(props.onEvent).not.toHaveBeenCalled();
    expect(shown.availableCount).toBeNull();
  });
  it.each(['profileId', 'sessionId', 'impersonationSubject'] as const)(
    'rejects stale explicit %s context',
    field => {
      const projection = partial();
      mount({
        projection: {
          ...projection,
          context: { ...projection.context, [field]: 'old-context' },
        },
      });
      expect(shown.showIntroduction).toBe(false);
      expect(shown.availableCount).toBeNull();
    }
  );
  it('forwards interaction, skip and navigation without blocking or inventing import events', () => {
    const { props } = mount();
    fireEvent.pointerDown(releaseButton());
    fireEvent.keyDown(releaseButton(), { key: 'Enter' });
    const skip = screen.getByRole('button', { name: 'Skip introduction' });
    fireEvent.pointerDown(skip);
    fireEvent.click(skip);
    act(() => actions.onNavigateAway());
    expect(
      vi.mocked(props.onEvent!).mock.calls.map(([event]) => event.type)
    ).toEqual([
      'user-interaction',
      'user-interaction',
      'skip',
      'navigate-away',
    ]);
    expect(shown.interactionBlocked).toBe(false);
  });
  it.each(['partial', 'failed', 'complete'] as const)(
    'passes actual %s scope truth without claiming a full catalog',
    status => {
      const projection = partial();
      mount({
        projection: {
          ...projection,
          view: {
            ...projection.view,
            status,
            scopeComplete: status === 'complete',
          },
        },
      });
      expect(shown.status).toBe(status);
      expect(shown.availableCount).toBe(1);
      expect(shown.fullCatalogComplete).toBe(false);
    }
  );
  it('keeps already-seen/reconnected presentation static', () => {
    const projection = partial();
    mount({
      projection: {
        ...projection,
        view: { ...projection.view, showIntroduction: false, motionIds: [] },
      },
    });
    expect(shown.showIntroduction).toBe(false);
    expect(shown.motionIds).toEqual([]);
  });
  it.each([
    {},
    { motionApproved: true },
    { motionApproved: true, motionProposal: proposal },
    {
      motionApproved: true,
      motionProposal: { ...proposal, material_benefit_uncertain: true },
      materialBenefitReceipt: benefitReceipt,
    },
    {
      motionApproved: true,
      motionProposal: proposal,
      materialBenefitReceipt: benefitReceipt,
      otherActiveDelights: 1,
    },
    {
      motionApproved: true,
      motionProposal: { ...proposal, repeats_during_routine_use: true },
      materialBenefitReceipt: benefitReceipt,
    },
  ])(
    'requires an actual complete motion gate; no default decorative motion %#',
    options => {
      mount(options);
      expect(shown.motionIds).toEqual([]);
    }
  );
  it('bounds approved IDs to actual committed records and honors reduced motion', () => {
    const projection = partial();
    const options = {
      motionApproved: true,
      motionProposal: proposal,
      materialBenefitReceipt: benefitReceipt,
    };
    const { props, rerender } = mount({
      ...options,
      projection: {
        ...projection,
        view: { ...projection.view, motionIds: ['release-1', 'preview-only'] },
      },
    });
    expect(shown.motionIds).toEqual(['release-1']);
    reduced.value = true;
    rerender(<LibraryFirstArrivalAdapter {...props} />);
    expect(shown.motionIds).toEqual([]);
  });
  it('does not turn optional effect delivery failure into a broken row interaction', () => {
    const onEventError = vi.fn();
    mount({
      onEventError,
      onEvent: () => {
        throw new Error('effect port unavailable');
      },
    });
    expect(() => fireEvent.pointerDown(releaseButton())).not.toThrow();
    expect(releaseButton()).toBeEnabled();
    expect(shown.showIntroduction).toBe(false);
    expect(shown.eventDelivery).toBe('failed');
    expect(onEventError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { type: 'user-interaction', scope },
        context: context(),
      })
    );
  });
  it('reports async port rejection and suppresses the introduction without blocking rows', async () => {
    const onEventError = vi.fn();
    mount({
      onEvent: async () => {
        throw new Error('async effect unavailable');
      },
      onEventError,
    });
    await act(async () => {
      fireEvent.pointerDown(releaseButton());
      await Promise.resolve();
    });
    expect(onEventError).toHaveBeenCalledOnce();
    expect(shown.eventDelivery).toBe('failed');
    expect(shown.showIntroduction).toBe(false);
    expect(releaseButton()).toBeEnabled();
  });
});
