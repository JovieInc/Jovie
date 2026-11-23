import { StatTile } from '@/components/molecules/drawer/StatTile';
import { Sparkline } from '@/components/shell/Sparkline';
import type { ViewBlock, ViewSpec } from '@/lib/views/spec';
import { ViewTable } from './ViewTable';

const DEFAULT_HTML_HEIGHT = 320;

function trendOf(points: readonly number[]): 'up' | 'down' | 'flat' {
  const first = points[0] ?? 0;
  const last = points[points.length - 1] ?? 0;
  if (last === first) return 'flat';
  return last > first ? 'up' : 'down';
}

function renderBlock(block: ViewBlock, index: number) {
  switch (block.type) {
    case 'sparkline':
      return (
        <section
          key={index}
          data-block='sparkline'
          className='space-y-2 rounded-lg border border-subtle bg-surface-1 p-3'
        >
          <h2 className='text-balance text-2xs font-caption text-secondary-token'>
            {block.label}
          </h2>
          <Sparkline
            points={block.points}
            trend={trendOf(block.points)}
            polarity={block.polarity}
            variant='pulse'
            ariaLabel={`${block.label} trend`}
          />
        </section>
      );
    case 'table':
      return (
        <section key={index} data-block='table'>
          <ViewTable
            columns={block.columns}
            rows={block.rows}
            caption={`Table ${index + 1}`}
          />
        </section>
      );
    case 'text':
      return (
        <p
          key={index}
          data-block='text'
          className='whitespace-pre-wrap text-sm text-secondary-token'
        >
          {block.body}
        </p>
      );
    case 'html':
      // Untrusted agent HTML: empty sandbox = no scripts, no same-origin, no forms.
      return (
        <iframe
          key={index}
          data-block='html'
          title={`Embedded content ${index + 1}`}
          sandbox=''
          srcDoc={block.html}
          referrerPolicy='no-referrer'
          loading='lazy'
          style={{ height: block.height ?? DEFAULT_HTML_HEIGHT }}
          className='w-full rounded-lg border border-subtle bg-white dark:bg-white'
        />
      );
    default:
      return null;
  }
}

/** Renders a validated jovie.view.v1 spec. Stats are grouped into one grid. */
export function ViewRenderer({ spec }: Readonly<{ spec: ViewSpec }>) {
  const items: React.ReactNode[] = [];
  let stats: { block: Extract<ViewBlock, { type: 'stat' }>; at: number }[] = [];
  const flush = (key: number) => {
    if (stats.length === 0) return;
    items.push(
      <div
        key={`stats-${key}`}
        data-block='stat-grid'
        className='grid grid-cols-2 gap-4 rounded-lg border border-subtle bg-surface-1 p-4 sm:grid-cols-3 lg:grid-cols-4'
      >
        {stats.map(({ block, at }) => (
          <StatTile
            key={at}
            label={block.label}
            value={block.value}
            hint={block.hint}
          />
        ))}
      </div>
    );
    stats = [];
  };
  spec.blocks.forEach((block, index) => {
    if (block.type === 'stat') {
      stats.push({ block, at: index });
      return;
    }
    flush(index);
    items.push(renderBlock(block, index));
  });
  flush(spec.blocks.length);
  return (
    <div data-testid='view-renderer' className='space-y-4'>
      {items}
    </div>
  );
}
