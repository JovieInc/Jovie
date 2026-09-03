'use client';

import { Button } from '@jovie/ui';
import {
  JOVIE_ICON_PATH,
  JOVIE_ICON_VIEW_BOX,
} from '@/components/atoms/jovie-icon-path';
import { RECOVERY_COPY } from '@/features/feedback/recovery-contract';

type SystemBErrorFallbackAction =
  | {
      readonly type: 'button';
      readonly label: string;
      readonly onClick: () => void;
      readonly variant?: 'primary' | 'secondary';
    }
  | {
      readonly type: 'link';
      readonly label: string;
      readonly href: string;
      readonly variant?: 'primary' | 'secondary';
    };

interface SystemBErrorFallbackProps {
  readonly title?: string;
  readonly description: string;
  /** Support-path diagnostic. Rendered only behind an opt-in disclosure. */
  readonly digest?: string;
  readonly action: SystemBErrorFallbackAction;
  readonly role?: 'alert';
  readonly ariaLive?: 'assertive' | 'polite';
  readonly className?: string;
}

function rootClassName(className: string | undefined): string {
  return ['dark', 'system-b-error-fallback', className]
    .filter(Boolean)
    .join(' ');
}

function actionVariant(
  variant: SystemBErrorFallbackAction['variant']
): 'primary' | 'secondary' {
  return variant === 'secondary' ? 'secondary' : 'primary';
}

function SystemBErrorFallbackActionControl({
  action,
}: {
  readonly action: SystemBErrorFallbackAction;
}) {
  const variant = actionVariant(action.variant);

  if (action.type === 'link') {
    return (
      <Button
        asChild
        variant={variant}
        size='sm'
        className='system-b-error-fallback__action-link'
      >
        <a href={action.href}>{action.label}</a>
      </Button>
    );
  }

  return (
    <Button type='button' variant={variant} size='sm' onClick={action.onClick}>
      {action.label || 'Action'}
    </Button>
  );
}

export function SystemBErrorFallback({
  title = RECOVERY_COPY.title,
  description,
  digest,
  action,
  role,
  ariaLive,
  className,
}: SystemBErrorFallbackProps) {
  return (
    <div className={rootClassName(className)} role={role} aria-live={ariaLive}>
      <div className='system-b-error-fallback__content'>
        <svg
          viewBox={JOVIE_ICON_VIEW_BOX}
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
          className='system-b-error-fallback__mark'
        >
          <path fill='currentColor' d={JOVIE_ICON_PATH} />
        </svg>

        <h1 className='system-b-error-fallback__title'>{title}</h1>
        <p className='system-b-error-fallback__description'>{description}</p>

        <div
          className='system-b-error-fallback__actions'
          data-recovery-actions=''
        >
          <SystemBErrorFallbackActionControl action={action} />
        </div>

        {digest ? (
          <details className='system-b-error-fallback__details'>
            <summary className='system-b-error-fallback__details-summary'>
              {RECOVERY_COPY.detailsLabel}
            </summary>
            <p className='system-b-error-fallback__digest'>
              Error ID: {digest}
            </p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
