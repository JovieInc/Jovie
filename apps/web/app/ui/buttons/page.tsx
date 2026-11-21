'use client';

import { Button } from '@jovie/ui';
import { Archive, ChevronDown, Plus, Settings, Trash2 } from 'lucide-react';
import { TableIconButton } from '@/components/organisms/table';
import { DashboardHeaderActionButton } from '@/features/dashboard/atoms/DashboardHeaderActionButton';

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className='mb-10'>
      <h2 className='mb-4 text-2xs font-semibold uppercase tracking-wider text-tertiary-token'>
        {title}
      </h2>
      <div className='flex flex-wrap items-center gap-3'>{children}</div>
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return <span className='text-2xs text-tertiary-token'>{children}</span>;
}

function Row({ children }: { readonly children: React.ReactNode }) {
  return <div className='flex flex-wrap items-center gap-3'>{children}</div>;
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
      <Row>{children}</Row>
    </div>
  );
}

export default function ButtonsPage() {
  return (
    <div>
      <h1 className='mb-1 text-lg font-semibold text-primary-token'>Button</h1>
      <p className='mb-8 text-app text-tertiary-token'>
        Canonical variants: primary, secondary, tertiary, ghost, and link.
        Destructive is a tone prop, not a standalone variant.
      </p>

      {/* Variants */}
      <Section title='Variants'>
        <Stack title='primary'>
          <Button variant='primary'>Save Changes</Button>
        </Stack>
        <Stack title='secondary'>
          <Button variant='secondary'>Cancel</Button>
        </Stack>
        <Stack title='tertiary'>
          <Button variant='tertiary'>Dismiss</Button>
        </Stack>
        <Stack title='ghost'>
          <Button variant='ghost'>View Details</Button>
        </Stack>
        <Stack title='link'>
          <Button variant='link'>Learn More</Button>
        </Stack>
      </Section>

      {/* Destructive tone */}
      <Section title='Destructive Tone'>
        <Stack title='primary destructive'>
          <Button destructive variant='primary'>
            Delete
          </Button>
        </Stack>
        <Stack title='secondary destructive'>
          <Button destructive variant='secondary'>
            Remove
          </Button>
        </Stack>
        <Stack title='tertiary destructive'>
          <Button destructive variant='tertiary'>
            Reject
          </Button>
        </Stack>
        <Stack title='ghost destructive'>
          <Button destructive variant='ghost'>
            Clear
          </Button>
        </Stack>
      </Section>

      {/* Sizes */}
      <Section title='Sizes'>
        <Stack title='sm'>
          <Button size='sm'>Small</Button>
        </Stack>
        <Stack title='md (default)'>
          <Button size='md'>Medium</Button>
        </Stack>
        <Stack title='lg'>
          <Button size='lg'>Large</Button>
        </Stack>
      </Section>

      {/* With icons */}
      <Section title='With Icons'>
        <Stack title='icon left'>
          <Button variant='primary'>
            <Plus className='h-4 w-4' />
            New Release
          </Button>
        </Stack>
        <Stack title='icon right'>
          <Button variant='secondary'>
            Export
            <ChevronDown className='h-4 w-4' />
          </Button>
        </Stack>
        <Stack title='icon only (square)'>
          <Button variant='ghost' size='icon' aria-label='Settings'>
            <Settings className='h-4 w-4' />
          </Button>
          <Button variant='secondary' size='icon' aria-label='Archive'>
            <Archive className='h-4 w-4' />
          </Button>
          <Button destructive variant='ghost' size='icon' aria-label='Delete'>
            <Trash2 className='h-4 w-4' />
          </Button>
        </Stack>
      </Section>

      {/* States */}
      <Section title='States'>
        <Stack title='loading'>
          <Button loading>Saving…</Button>
          <Button variant='secondary' loading>
            Loading
          </Button>
        </Stack>
        <Stack title='disabled'>
          <Button disabled>Disabled</Button>
          <Button variant='secondary' disabled>
            Disabled
          </Button>
          <Button variant='ghost' disabled>
            Disabled
          </Button>
        </Stack>
      </Section>

      {/* Icon button variants — app context */}
      <Section title='Icon Buttons — App UI'>
        <Stack title='DashboardHeaderActionButton'>
          <DashboardHeaderActionButton
            ariaLabel='Open settings'
            icon={<Settings />}
          />
          <DashboardHeaderActionButton ariaLabel='Add item' icon={<Plus />} />
          <DashboardHeaderActionButton
            ariaLabel='Active state'
            pressed
            icon={<Archive />}
          />
        </Stack>
        <Stack title='TableIconButton'>
          <TableIconButton
            icon={<Settings className='h-4 w-4' />}
            onClick={() => {}}
            ariaLabel='Settings'
            tooltip='Settings'
          />
          <TableIconButton
            icon={<Trash2 className='h-4 w-4' />}
            onClick={() => {}}
            ariaLabel='Delete'
            variant='danger'
            tooltip='Delete'
          />
        </Stack>
      </Section>

      {/* Secondary hover demo — previously broken */}
      <Section title='Secondary Hover (was broken — verify hover works)'>
        <Button variant='secondary'>Hover Me</Button>
        <Button variant='secondary'>
          <Archive className='h-4 w-4' />
          Archive
        </Button>
      </Section>
    </div>
  );
}
