import { Card, CardContent, CardHeader, CardTitle } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { DrawerSurfaceCard } from '@/components/molecules/drawer/DrawerSurfaceCard';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { LINEAR_SURFACE } from '@/components/tokens/linear-surface';

/**
 * Surface Elevation Matrix (JOV-2156).
 *
 * Renders every nesting combination from `.claude/rules/ui.md`
 * "Surface Elevation Rules" — allowed patterns and banned patterns — so
 * Playwright (`tests/e2e/storybook-elevation.spec.ts`) can snapshot each one
 * in light and dark mode. Banned stories are intentional regressions: their
 * baselines are the "this should look BROKEN" sanity check. If a banned story
 * suddenly looks acceptable (or an allowed one goes invisible), the visual
 * diff is the alarm.
 */

function ShellCanvas({ children }: { readonly children: ReactNode }) {
  return (
    <div className='min-h-[360px] w-full bg-(--linear-app-content-surface) p-8'>
      {children}
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  readonly tone: 'allowed' | 'banned';
  readonly children: ReactNode;
}) {
  return (
    <p
      className={`mb-4 text-xs ${
        tone === 'banned' ? 'text-destructive' : 'text-secondary-token'
      }`}
    >
      {children}
    </p>
  );
}

const PLACEHOLDER =
  'Surface elevation matrix fixture content. Stable copy keeps screenshots deterministic.';

const meta = {
  title: 'Design System/Elevation Matrix',
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Allowed patterns
// ---------------------------------------------------------------------------

export const CardOnShellCanvas: Story = {
  name: 'Allowed: Card on shell canvas',
  render: () => (
    <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: Card (bg-surface-1 + border-subtle + shadow-card) on the
        app-shell canvas. Must read as a distinct elevated card in both themes.
      </Note>
      <Card data-testid='elevation-card'>
        <CardHeader>
          <CardTitle>Card on shell canvas</CardTitle>
        </CardHeader>
        <CardContent>{PLACEHOLDER}</CardContent>
      </Card>
    </ShellCanvas>
  ),
};

export const WellOnShellCanvas: Story = {
  name: 'Allowed: recessed well on shell canvas',
  render: () => (
    <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: recessed well (bg-surface-0) directly on the shell canvas —
        e.g. skeleton containers, empty states, input wells.
      </Note>
      <div className='rounded-lg bg-surface-0 p-6'>{PLACEHOLDER}</div>
    </ShellCanvas>
  ),
};

export const WellInsideCard: Story = {
  name: 'Allowed: recessed well inside Card',
  render: () => (
    <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: inner element uses bg-surface-0 when nested inside a card.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Card with recessed well</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='rounded-lg bg-surface-0 p-4'>{PLACEHOLDER}</div>
        </CardContent>
      </Card>
    </ShellCanvas>
  ),
};

export const DrawerCardOnShell: Story = {
  name: 'Allowed: DrawerSurfaceCard on shell canvas',
  render: () => (
    <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: DrawerSurfaceCard variant=&quot;card&quot; — border-only,
        shadow-none (the parent drawer owns the elevation).
      </Note>
      <DrawerSurfaceCard variant='card' className='p-4'>
        {PLACEHOLDER}
      </DrawerSurfaceCard>
    </ShellCanvas>
  ),
};

export const FlatDrawerCardInsideCard: Story = {
  name: 'Allowed: DrawerSurfaceCard flat inside Card',
  render: () => (
    <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: inner elements inside a card use DrawerSurfaceCard
        variant=&quot;flat&quot; (no second elevation).
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Card with flat inner section</CardTitle>
        </CardHeader>
        <CardContent>
          <DrawerSurfaceCard variant='flat' className='py-2'>
            {PLACEHOLDER}
          </DrawerSurfaceCard>
        </CardContent>
      </Card>
    </ShellCanvas>
  ),
};

export const FlatDrawerCardInsideDrawerCard: Story = {
  name: 'Allowed: flat inside DrawerSurfaceCard',
  render: () => (
    <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: DrawerSurfaceCard variant=&quot;flat&quot; nested inside
        DrawerSurfaceCard variant=&quot;card&quot;.
      </Note>
      <DrawerSurfaceCard variant='card' className='p-4'>
        <DrawerSurfaceCard variant='flat' className='py-2'>
          {PLACEHOLDER}
        </DrawerSurfaceCard>
      </DrawerSurfaceCard>
    </ShellCanvas>
  ),
};

export const ContentContainerOnShell: Story = {
  name: 'Allowed: LINEAR_SURFACE content container',
  render: () => (
    <ShellCanvas>
      <Note tone='allowed'>
        ALLOWED: table/workspace routes wrap primary content in a bordered
        LINEAR_SURFACE.contentContainer on the shell canvas.
      </Note>
      <div className={`${LINEAR_SURFACE.contentContainer} p-6`}>
        {PLACEHOLDER}
      </div>
    </ShellCanvas>
  ),
};

export const EntitySidebarShellDefault: Story = {
  name: 'Allowed: EntitySidebarShell drawer surface',
  render: () => (
    <div className='relative min-h-[480px] w-full bg-(--linear-app-content-surface)'>
      <EntitySidebarShell
        isOpen
        ariaLabel='Elevation matrix sidebar'
        title='Elevation matrix sidebar'
        entityHeader={<div className='px-3 py-2'>Entity header</div>}
      >
        <div className='px-3 py-2'>{PLACEHOLDER}</div>
      </EntitySidebarShell>
    </div>
  ),
};

// ---------------------------------------------------------------------------
// Banned patterns — these SHOULD look broken. Their baselines are the sanity
// check: if one starts looking acceptable, the diff review must confirm why.
// ---------------------------------------------------------------------------

export const BannedCardInsideCard: Story = {
  name: 'BANNED: Card inside Card',
  render: () => (
    <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): Card nested inside Card — double elevation.
        Use variant=&quot;flat&quot; inner elements instead.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Outer card</CardTitle>
        </CardHeader>
        <CardContent>
          <Card>
            <CardContent>{PLACEHOLDER}</CardContent>
          </Card>
        </CardContent>
      </Card>
    </ShellCanvas>
  ),
};

export const BannedDrawerCardInsideCard: Story = {
  name: 'BANNED: DrawerSurfaceCard card inside Card',
  render: () => (
    <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): DrawerSurfaceCard variant=&quot;card&quot;
        inside another card — card-within-card nesting. Use
        variant=&quot;flat&quot; for inner elements.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Outer card</CardTitle>
        </CardHeader>
        <CardContent>
          <DrawerSurfaceCard variant='card' className='p-4'>
            {PLACEHOLDER}
          </DrawerSurfaceCard>
        </CardContent>
      </Card>
    </ShellCanvas>
  ),
};

export const BannedSurface1OnSurface1NoBorder: Story = {
  name: 'BANNED: surface-1 on surface-1 without border',
  render: () => (
    <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-surface-1 on a surface-1 parent with no
        border and no shadow — same color on same color. In light mode the child
        below is INVISIBLE; that invisibility is the expected baseline.
      </Note>
      <div className='rounded-lg bg-surface-1 p-6' data-testid='surface-parent'>
        <div
          className='rounded-lg bg-surface-1 p-6'
          data-testid='surface-child'
        >
          {PLACEHOLDER}
        </div>
      </div>
    </ShellCanvas>
  ),
};

export const BannedSurface1Translucent: Story = {
  name: 'BANNED: translucent surface-1 on surface-1',
  render: () => (
    <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-surface-1/50 on a surface-1 parent —
        low-opacity same-color surfaces are nearly invisible.
      </Note>
      <div className='rounded-lg bg-surface-1 p-6'>
        <div className='rounded-lg bg-surface-1/50 p-6'>{PLACEHOLDER}</div>
      </div>
    </ShellCanvas>
  ),
};

export const BannedCardStrippedElevation: Story = {
  name: 'BANNED: Card with border-0 shadow-none',
  render: () => (
    <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): Card className=&quot;border-0
        shadow-none&quot; strips all elevation from a surface-1 card, making it
        invisible on a surface-1 parent.
      </Note>
      <div className='rounded-lg bg-surface-1 p-6'>
        <Card className='border-0 shadow-none'>
          <CardContent>{PLACEHOLDER}</CardContent>
        </Card>
      </div>
    </ShellCanvas>
  ),
};

export const BannedSurface0Translucent: Story = {
  name: 'BANNED: translucent surface-0',
  render: () => (
    <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-surface-0/50 — semi-transparent recessed
        wells must be solid bg-surface-0 instead.
      </Note>
      <Card>
        <CardHeader>
          <CardTitle>Card with translucent well</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='rounded-lg bg-surface-0/50 p-4'>{PLACEHOLDER}</div>
        </CardContent>
      </Card>
    </ShellCanvas>
  ),
};

export const BannedContentSurfaceCard: Story = {
  name: 'BANNED: content-surface card inside shell',
  render: () => (
    <ShellCanvas>
      <Note tone='banned'>
        BANNED (should look BROKEN): bg-(--linear-app-content-surface) on a
        card-like element inside the shell — only shell chrome
        (toolbar/header/frame) may use the canvas tone. The &quot;card&quot;
        below blends into the canvas; that is the bug.
      </Note>
      <div className='rounded-lg bg-(--linear-app-content-surface) p-6'>
        {PLACEHOLDER}
      </div>
    </ShellCanvas>
  ),
};
