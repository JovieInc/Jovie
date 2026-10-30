// @coverage-via apps/web/components/marketing/ImageryStage.test.tsx
import type { CSSProperties, ReactNode } from 'react';
import {
  getStageSpec,
  type ImageryStageId,
  layerBox,
  layersByDepth,
  parseAspect,
  plateFiles,
  type StageLayer,
} from '@/lib/imagery/stages';
import { getProductShot } from '@/lib/screenshots/product-shots';
import { cn } from '@/lib/utils';
import { ProductShot } from './ProductShot';
import './ImageryStage.css';

interface ImageryStageProps {
  readonly id: ImageryStageId;
  readonly className?: string;
  readonly priority?: boolean;
  /** Headline and CTA. Rendered inside the stage's quiet zone. */
  readonly children?: ReactNode;
}

const pct = (value: number) => `${+(value * 100).toFixed(3)}%`;

function layerStyle(
  layer: StageLayer,
  recede: number,
  box: { x: number; y: number; w: number; h: number }
): CSSProperties {
  const vars: Record<string, string | number> = {
    '--layer-x': pct(layer.anchor.x),
    '--layer-y': pct(layer.anchor.y),
    '--layer-w': pct(layer.scale),
    '--layer-z': layer.depth.z,
    '--layer-recede': recede,
    '--layer-height-hint': pct(box.h),
  };
  if (layer.mobile === 'hidden') {
    vars['--layer-mobile-display'] = 'none';
  } else if (layer.mobile) {
    vars['--layer-mobile-x'] = pct(layer.mobile.anchor.x);
    vars['--layer-mobile-y'] = pct(layer.mobile.anchor.y);
    vars['--layer-mobile-w'] = pct(layer.mobile.scale);
  }
  return vars as CSSProperties;
}

/**
 * The art-directed imagery unit (docs/marketing/IMAGERY.md): a generated
 * plate, real product shots layered at depth, one lit wedge, and a reserved
 * quiet zone for the headline. Layers are placed by the stage spec
 * (`lib/imagery/stages.ts`); depth is transform scale/offset and tonal black
 * shadow, never tilt, glass or glow.
 */
export function ImageryStage({
  id,
  className,
  priority = false,
  children,
}: ImageryStageProps) {
  const stage = getStageSpec(id);
  const plate = plateFiles(stage.plate.id);
  const ordered = layersByDepth(stage.layers);
  const stageAspect = parseAspect(stage.aspect.desktop);
  return (
    <figure
      className={cn('imagery-stage', className)}
      style={
        {
          '--stage-aspect': stage.aspect.desktop,
          '--stage-aspect-mobile': stage.aspect.mobile,
        } as CSSProperties
      }
      data-imagery-stage={stage.id}
      data-accent={stage.plate.accent}
      data-testid={`imagery-stage-${stage.id}`}
      aria-label={stage.alt}
    >
      <picture className='imagery-stage__plate'>
        <source type='image/avif' srcSet={plate.avif} />
        <img
          src={plate.webp}
          alt=''
          width={1920}
          height={1080}
          loading={priority ? 'eager' : 'lazy'}
          decoding='async'
          fetchPriority={priority ? 'high' : 'auto'}
        />
      </picture>
      {ordered.map((layer, index) => {
        const shot = getProductShot(layer.shotId);
        const crop = layer.crop;
        const box = layerBox(layer, shot.width / shot.height, stageAspect);
        const recede = (ordered.length - 1 - index) * 0.28;
        return (
          <div
            key={layer.shotId}
            className={cn(
              'imagery-stage__layer',
              `imagery-stage__layer--shadow-${layer.depth.shadow}`,
              crop && 'imagery-stage__layer--cropped'
            )}
            style={layerStyle(layer, recede, box)}
            data-layer={layer.shotId}
            data-depth={layer.depth.z}
          >
            {crop ? (
              <div
                className='imagery-stage__crop'
                style={
                  {
                    '--crop-aspect': `${crop.w * shot.width} / ${crop.h * shot.height}`,
                    '--crop-scale': pct(1 / crop.w),
                    '--crop-left': pct(-crop.x / crop.w),
                    '--crop-top': pct(-crop.y / crop.h),
                  } as CSSProperties
                }
              >
                <ProductShot id={layer.shotId} priority={priority} />
              </div>
            ) : (
              <ProductShot id={layer.shotId} priority={priority} />
            )}
          </div>
        );
      })}
      {children ? (
        <div
          className='imagery-stage__copy'
          style={
            {
              '--safe-x': pct(stage.safeArea.x),
              '--safe-y': pct(stage.safeArea.y),
              '--safe-w': pct(stage.safeArea.w),
              '--safe-h': pct(stage.safeArea.h),
            } as CSSProperties
          }
        >
          {children}
        </div>
      ) : null}
    </figure>
  );
}
