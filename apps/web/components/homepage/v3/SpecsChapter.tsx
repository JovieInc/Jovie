import {
  HOMEPAGE_EDITORIAL_COPY,
  HOMEPAGE_PRODUCT_UI,
} from '@/data/homepageEditorialCopy';
import { HOME_SPEC } from './home-spec';
import { Orbit } from './Orbit';
import { ReleaseInspector } from './ProductUi';
import { Callout, CommandPaletteCard } from './Surfaces';

const SPECS = HOMEPAGE_EDITORIAL_COPY.specs;
const OWNER = 'apps/web/components/homepage/v3/SpecsChapter.tsx';

interface SheetCell {
  readonly value: string;
  readonly title: string;
  readonly detail: string;
  readonly mono?: boolean;
}

function Cell({
  cell,
  large = false,
}: Readonly<{ cell: SheetCell; large?: boolean }>) {
  return (
    <div className='hv3-sheet__cell'>
      <b className={large ? 'hv3-num' : 'hv3-num hv3-num--sm'}>{cell.value}</b>
      <p>
        <strong>{cell.title}</strong>
        {cell.mono ? (
          <span className='hv3-mono'>{cell.detail}</span>
        ) : (
          cell.detail
        )}
      </p>
    </div>
  );
}

/** One meter segment per recognised service; the streaming ones are lit. */
function Meter() {
  const segments = Array.from(
    { length: HOME_SPEC.recognised },
    (_, index) => index
  );
  return (
    <div
      className='hv3-meter'
      style={{ '--hv3-meter-n': HOME_SPEC.recognised } as React.CSSProperties}
    >
      {segments.map(index => (
        <i
          key={index}
          data-on={index < HOME_SPEC.listen ? 'true' : undefined}
        />
      ))}
    </div>
  );
}

/** 03 specs: the tech-specs sheet, then the ⌘K and inspector moments. */
export function SpecsChapter() {
  const services = SPECS.services;
  return (
    <section
      id='specs'
      data-pen-section='specs'
      data-testid='marketing-section-specs'
      data-marketing-owner={OWNER}
      className='hv3 hv3-chapter hv3-specs'
    >
      <div className='hv3-rule'>
        <span className='hv3-mono'>03 · specs</span>
      </div>
      <div className='hv3-specs__head hv3-reveal'>
        <h2 className='hv3-statement'>{SPECS.headline}</h2>
        <p className='hv3-body'>{SPECS.body}</p>
      </div>
      <div className='hv3-sheet hv3-reveal'>
        <div className='hv3-sheet__row'>
          <h3 className='hv3-sheet__label'>{services.label}</h3>
          <Cell
            large
            cell={{ value: String(HOME_SPEC.listen), ...services.listen }}
          />
          <Cell
            large
            cell={{
              value: String(HOME_SPEC.recognised),
              ...services.recognised,
            }}
          />
          <div className='hv3-sheet__cell hv3-sheet__cell--meter'>
            <Meter />
            <p className='hv3-mono'>
              {SPECS.meter(HOME_SPEC.listen, HOME_SPEC.recognised)}
            </p>
          </div>
        </div>
        {SPECS.rows.map(row => (
          <div key={row.label} className='hv3-sheet__row'>
            <h3 className='hv3-sheet__label'>{row.label}</h3>
            {row.cells.map(cell => (
              <Cell key={cell.title} cell={cell} />
            ))}
          </div>
        ))}
      </div>
      <div className='hv3-moments hv3-reveal'>
        <article className='hv3-moment'>
          <div className='hv3-moment__stage' aria-hidden>
            <Orbit id='hv3-orbit-palette' rings={[520, 420]} arc={[300, 42]} />
            <div className='hv3-glow hv3-glow--palette' />
            <CommandPaletteCard />
            <div className='hv3-keys'>
              <span className='hv3-key'>
                <b>⌘</b>
                <span>{HOMEPAGE_PRODUCT_UI.keys.command}</span>
              </span>
              <span className='hv3-plus'>+</span>
              <span className='hv3-key'>
                <b>K</b>
                <span>&nbsp;</span>
              </span>
            </div>
          </div>
          <p className='hv3-moment__cap'>
            <b>{SPECS.paletteCaption.lead}</b> {SPECS.paletteCaption.body}
          </p>
        </article>
        <article className='hv3-moment'>
          <div className='hv3-moment__stage' aria-hidden>
            <div className='hv3-glow hv3-glow--insp' />
            <div className='hv3-rig hv3-rig--moment'>
              <div className='hv3-lift hv3-lift--moment hv3-edge'>
                <ReleaseInspector anchor='mupc' />
              </div>
            </div>
            <Callout
              anchor='mupc'
              label={SPECS.upcCallout}
              className='hv3-callout--m-upc'
            />
          </div>
          <p className='hv3-moment__cap'>
            <b>{SPECS.inspectorCaption.lead}</b> {SPECS.inspectorCaption.body}
          </p>
        </article>
      </div>
    </section>
  );
}
