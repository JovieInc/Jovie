'use client';

import { Button, Kbd, SimpleTooltip } from '@jovie/ui';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2 className='mb-4 text-[11px] font-semibold uppercase tracking-wider text-(--linear-text-tertiary)'>
        {title}
      </h2>
      <div className='flex flex-wrap items-center gap-6'>{children}</div>
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className='text-[11px] text-(--linear-text-tertiary)'>
      {children}
    </span>
  );
}

function Stack({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2'>
      <Label>{title}</Label>
      {children}
    </div>
  );
}

export default function TooltipsPage() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-(--linear-text-primary)'>
        Tooltip
      </h1>
      <p className='mb-8 text-[13px] text-(--linear-text-tertiary)'>
        Matches Linear.app — 4px radius, surface-0 bg, 12px font, instant 100ms
        animation
      </p>

      {/* Basic */}
      <Section title='Basic'>
        <Stack title='default (top)'>
          <SimpleTooltip content='Save changes'>
            <Button variant='secondary'>Hover me</Button>
          </SimpleTooltip>
        </Stack>
      </Section>

      {/* With keyboard shortcut */}
      <Section title='With Keyboard Shortcut'>
        <Stack title='inline kbd'>
          <SimpleTooltip
            content={
              <span className='inline-flex items-center gap-2'>
                Save
                <Kbd variant='tooltip'>⌘S</Kbd>
              </span>
            }
          >
            <Button variant='secondary'>Save</Button>
          </SimpleTooltip>
        </Stack>
        <Stack title='multiple keys'>
          <SimpleTooltip
            content={
              <span className='inline-flex items-center gap-2'>
                Undo
                <Kbd variant='tooltip'>⌘Z</Kbd>
              </span>
            }
          >
            <Button variant='secondary'>Undo</Button>
          </SimpleTooltip>
        </Stack>
      </Section>

      {/* Sides */}
      <Section title='Placement'>
        <Stack title='top'>
          <SimpleTooltip content='Top tooltip' side='top'>
            <Button variant='secondary'>Top</Button>
          </SimpleTooltip>
        </Stack>
        <Stack title='bottom'>
          <SimpleTooltip content='Bottom tooltip' side='bottom'>
            <Button variant='secondary'>Bottom</Button>
          </SimpleTooltip>
        </Stack>
        <Stack title='left'>
          <SimpleTooltip content='Left tooltip' side='left'>
            <Button variant='secondary'>Left</Button>
          </SimpleTooltip>
        </Stack>
        <Stack title='right'>
          <SimpleTooltip content='Right tooltip' side='right'>
            <Button variant='secondary'>Right</Button>
          </SimpleTooltip>
        </Stack>
      </Section>

      {/* Long text */}
      <Section title='Long Description'>
        <Stack title='max-width 220px'>
          <SimpleTooltip content='This is a longer tooltip description that demonstrates how text wraps within the 220px max-width constraint.'>
            <Button variant='secondary'>Hover for details</Button>
          </SimpleTooltip>
        </Stack>
      </Section>

      {/* Disabled element */}
      <Section title='Disabled Element'>
        <Stack title='wrapped in span'>
          <SimpleTooltip content='This action is currently unavailable'>
            <span>
              <Button variant='secondary' disabled>
                Disabled
              </Button>
            </span>
          </SimpleTooltip>
        </Stack>
      </Section>
    </div>
  );
}
