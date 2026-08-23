import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_PLAN_MOVE_REMIX_NEAR_LA } from '@/lib/release-planning/demo-events';
import { generateDemoPlan } from '@/lib/release-planning/demo-plan';
import { ReleaseCalendar } from './ReleaseCalendar';

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: vi.fn(),
});

vi.mock('motion/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const Passthrough = ({ children }: { readonly children: React.ReactNode }) =>
    children;

  return {
    AnimatePresence: Passthrough,
    LayoutGroup: Passthrough,
    motion: new Proxy(
      {},
      {
        get: (_target, element: string) =>
          React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
            ({ children, ...props }, ref) => {
              const domProps = { ...props } as Record<string, unknown>;
              for (const animationProp of [
                'animate',
                'exit',
                'initial',
                'layoutId',
                'transition',
              ]) {
                delete domProps[animationProp];
              }
              return React.createElement(
                element,
                { ...domProps, ref },
                children
              );
            }
          ),
      }
    ),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReleaseCalendar', () => {
  it('uses the canonical card surface and preserves moment selection', () => {
    const plan = generateDemoPlan();
    const onMomentClick = vi.fn();

    render(
      <ReleaseCalendar
        plan={plan}
        onPlanChange={vi.fn()}
        onMomentClick={onMomentClick}
      />
    );

    expect(screen.getByTestId('release-calendar')).toHaveClass(
      'rounded-xl',
      'border'
    );
    fireEvent.click(screen.getByTestId(`release-moment-card-${plan[0]?.slug}`));
    expect(onMomentClick).toHaveBeenCalledWith(plan[0]);
  });

  it('moves the remix through the existing release-plan event contract', () => {
    const plan = generateDemoPlan();
    const onPlanChange = vi.fn();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(
      callback => {
        callback(0);
        return 1;
      }
    );

    render(
      <ReleaseCalendar
        plan={plan}
        onPlanChange={onPlanChange}
        onMomentClick={vi.fn()}
      />
    );

    act(() => {
      globalThis.dispatchEvent(new Event(RELEASE_PLAN_MOVE_REMIX_NEAR_LA));
    });

    expect(onPlanChange).toHaveBeenCalledTimes(1);
    const nextPlan = onPlanChange.mock.calls[0]?.[0];
    expect(
      nextPlan.find(
        (moment: { readonly momentType: string }) =>
          moment.momentType === 'remix'
      )?.tourDateId
    ).toBe('la');
  });
});
