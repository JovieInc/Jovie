import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { Button } from './button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

const SHEET_SIDES = ['top', 'bottom', 'left', 'right'] as const;
type SheetSide = (typeof SHEET_SIDES)[number];

const meta: Meta<typeof Sheet> = {
  title: 'UI/Atoms/Sheet',
  component: Sheet,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant='secondary'>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Refine your library results.</SheetDescription>
        </SheetHeader>
        <div className='grid gap-2'>
          {['All listeners', 'Returning visitors', 'New subscribers'].map(
            option => (
              <button
                key={option}
                type='button'
                className='rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token'
              >
                {option}
              </button>
            )
          )}
        </div>
        <SheetFooter>
          <Button variant='secondary'>Reset</Button>
          <Button>Apply filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftRail: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent side='left'>
        <SheetHeader>
          <SheetTitle>Audience details</SheetTitle>
          <SheetDescription>
            Side, surface, spacing, and close anatomy stay consistent.
          </SheetDescription>
        </SheetHeader>
        <div className='grid gap-3'>
          {[
            'Germany · 18 visits',
            'United States · 12 visits',
            'UK · 7 visits',
          ].map(listener => (
            <div
              key={listener}
              className='rounded-(--system-b-radius-panel-inner) border border-subtle bg-surface-1 p-3 text-sm text-secondary-token'
            >
              {listener}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  ),
};

function SheetConformanceFixture({
  side,
  disablePortal = false,
}: {
  readonly side: SheetSide;
  readonly disablePortal?: boolean;
}) {
  const label = `${side[0].toUpperCase()}${side.slice(1)}`;

  return (
    <div
      className='min-w-0'
      data-testid={`sheet-fixture-${side}`}
      data-portal={disablePortal ? 'inline' : 'portal'}
    >
      <Sheet>
        <SheetTrigger asChild>
          <Button data-testid={`sheet-trigger-${side}`} variant='secondary'>
            Open {side} sheet
          </Button>
        </SheetTrigger>
        <SheetContent
          side={side}
          disablePortal={disablePortal}
          testId={`sheet-content-${side}`}
        >
          <SheetHeader>
            <SheetTitle>{label} sheet</SheetTitle>
            <SheetDescription>
              Review audience details without losing your place.
            </SheetDescription>
          </SheetHeader>
          <div className='min-w-0 space-y-3'>
            <p
              className='break-words text-sm leading-relaxed text-secondary-token'
              data-testid={`sheet-body-${side}`}
            >
              Long labels remain contained at compact widths:
              https://jov.ie/artist/this-is-a-long-public-profile-slug
            </p>
            <div className='grid gap-2'>
              <button
                className='min-w-0 break-words rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token'
                type='button'
              >
                Returning listeners
              </button>
              <button
                className='min-w-0 break-words rounded-(--system-b-radius-overlay) border border-subtle bg-surface-1 px-3 py-2 text-left text-sm text-secondary-token hover:text-primary-token'
                type='button'
              >
                New subscribers
              </button>
            </div>
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button
                data-testid={`sheet-footer-close-${side}`}
                variant='secondary'
              >
                Close {side}
              </Button>
            </SheetClose>
            <Button>Apply filters</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export const ConformanceMatrix: Story = {
  render: () => (
    <div
      className='grid min-w-0 gap-4 rounded-(--system-b-radius-panel) bg-surface-0 p-4 text-primary-token'
      data-testid='sheet-conformance'
      style={{ width: 'min(26rem, calc(100vw - 2rem))' }}
    >
      <div className='min-w-0 space-y-1'>
        <p className='text-sm font-medium'>Sheet directions</p>
        <p className='break-words text-sm text-secondary-token'>
          Every edge keeps the same dialog semantics, close affordance, and
          compact overflow contract.
        </p>
      </div>
      <div className='grid min-w-0 grid-cols-2 gap-2'>
        <SheetConformanceFixture side='top' disablePortal />
        <SheetConformanceFixture side='bottom' />
        <SheetConformanceFixture side='left' />
        <SheetConformanceFixture side='right' />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>(
      '[data-testid="sheet-conformance"]'
    );
    await waitFor(() => expect(root).toBeInTheDocument());
    if (!root) return;

    for (const side of SHEET_SIDES) {
      const trigger = root.querySelector<HTMLButtonElement>(
        `[data-testid="sheet-trigger-${side}"]`
      );
      await expect(trigger).toBeInTheDocument();
      await expect(trigger).toHaveAccessibleName(`Open ${side} sheet`);
    }

    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
  parameters: {
    docs: {
      description: {
        story:
          'Canonical Sheet proof surface: all four edge variants, one inline and three portaled hosts, named dialog anatomy, close affordances, long content, and compact overflow stability. Controlled state is covered by the existing Controlled Mode unit tests; pointer-path responsiveness is outside this matrix. Pen identity remains source-bound until a canonical save/readback is available.',
      },
    },
  },
};

export const Partial: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Only the required title, with the optional side, description, body and footer omitted; the sheet defaults to the right edge.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            Audience insights for every territory, platform and smart link you
            shared this release cycle
          </SheetTitle>
          <SheetDescription>
            Listener counts update hourly and include returning visitors, new
            subscribers and fans who opened your links from playlists, press
            coverage or social posts.
          </SheetDescription>
        </SheetHeader>
        <div className='grid min-w-0 gap-2'>
          {Array.from({ length: 14 }, (_, index) => index + 1).map(row => (
            <p
              key={row}
              className='min-w-0 break-words text-sm text-secondary-token'
            >
              Territory {row}: listeners arriving from
              https://jov.ie/artist/a-very-long-public-profile-slug-{row}
            </p>
          ))}
        </div>
        <SheetFooter>
          <Button variant='secondary'>Reset every filter</Button>
          <Button>Apply audience filters</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'A long title, description, unbroken URLs and many rows wrap within the sheet width and the body scrolls instead of overflowing.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <Sheet defaultOpen>
        <SheetContent side='left' dir='rtl'>
          <SheetHeader>
            <SheetTitle>تفاصيل الجمهور حسب الدولة والمنصة</SheetTitle>
            <SheetDescription>
              راجع عدد المستمعين العائدين والمشتركين الجدد دون أن تفقد مكانك في
              الصفحة. تُحدَّث الأرقام كل ساعة لجميع الروابط التي شاركتها.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <Button variant='secondary'>إعادة التعيين</Button>
            <Button>تطبيق عوامل التصفية</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  ),
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'Right-to-left Arabic copy wraps inside a start-edge sheet and the footer actions follow the reading direction.',
      },
    },
  },
};
