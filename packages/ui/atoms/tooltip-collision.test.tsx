/**
 * Far-edge placement coverage for TooltipContent collision handling.
 *
 * jsdom has no layout engine, so we can't assert rendered pixel positions.
 * Instead we partially mock the Radix Content primitive to verify that the
 * @jovie/ui TooltipContent forwards viewport-collision props by default:
 * avoidCollisions + collisionPadding (8px). Radix's floating positioning
 * (well-covered upstream) then guarantees far-edge tooltips flip/shift to
 * stay fully inside the viewport.
 */
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capturedContentProps = vi.hoisted(
  () => [] as Array<Record<string, unknown>>
);

vi.mock('@radix-ui/react-tooltip', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@radix-ui/react-tooltip')>();
  const RecordingContent = React.forwardRef<
    React.ComponentRef<typeof actual.Content>,
    React.ComponentPropsWithoutRef<typeof actual.Content>
  >((props, ref) => {
    capturedContentProps.push(props as Record<string, unknown>);
    return <actual.Content ref={ref} {...props} />;
  });
  RecordingContent.displayName = 'RecordingTooltipContent';
  // Force tooltips open so Content mounts without hover (unreliable in jsdom).
  const ForcedOpenRoot = (
    props: React.ComponentPropsWithoutRef<typeof actual.Root>
  ) => <actual.Root {...props} open={props.open ?? true} />;
  return { ...actual, Content: RecordingContent, Root: ForcedOpenRoot };
});

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
import { TooltipShortcut } from './tooltip-shortcut';

const lastContentProps = () => {
  const props = capturedContentProps.at(-1);
  expect(props).toBeDefined();
  return props as Record<string, unknown>;
};

describe('TooltipContent collision handling (far-edge placement)', () => {
  beforeEach(() => {
    capturedContentProps.length = 0;
  });

  it('enables avoidCollisions with an 8px collisionPadding by default', () => {
    render(
      <TooltipProvider>
        <Tooltip open={true}>
          <TooltipTrigger>
            <button type='button'>Far-edge trigger</button>
          </TooltipTrigger>
          <TooltipContent side='bottom'>
            <span>Hide profile</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.getByTestId('tooltip-content')).toBeInTheDocument();
    const props = lastContentProps();
    expect(props.avoidCollisions).toBe(true);
    expect(props.collisionPadding).toBe(8);
  });

  it('allows consumers to override collisionPadding', () => {
    render(
      <TooltipProvider>
        <Tooltip open={true}>
          <TooltipTrigger>
            <button type='button'>Trigger</button>
          </TooltipTrigger>
          <TooltipContent collisionPadding={16}>
            <span>Content</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    expect(lastContentProps().collisionPadding).toBe(16);
  });

  it('applies collision defaults through TooltipShortcut (header rail toggle case)', () => {
    render(
      <TooltipProvider>
        <TooltipShortcut label='Hide profile' shortcut=']' side='bottom'>
          <button type='button'>Rail toggle</button>
        </TooltipShortcut>
      </TooltipProvider>
    );

    const props = lastContentProps();
    expect(props.side).toBe('bottom');
    expect(props.avoidCollisions).toBe(true);
    expect(props.collisionPadding).toBe(8);
  });
});
