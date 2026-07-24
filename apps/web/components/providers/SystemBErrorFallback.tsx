'use client';

import { Button } from '@jovie/ui';
import {
  JOVIE_ICON_PATH,
  JOVIE_ICON_VIEW_BOX,
} from '@/components/atoms/jovie-icon-path';

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
  readonly digest?: string;
  readonly actions: readonly SystemBErrorFallbackAction[];
  readonly role?: 'alert';
  readonly ariaLive?: 'assertive' | 'polite';
  readonly className?: string;
}

function rootClassName(className: string | undefined): string {
  return ['dark', 'system-b-error-fallback', className]
    .filter(Boolean)
    .join(' ');
}

export function SystemBErrorFallback({
  title = 'Something Went Wrong',
  description,
  digest,
  actions,
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

        <div className='system-b-error-fallback__actions'>
          {actions.map(action => {
            if (action.type === 'link') {
              return (
                <a
                  key={`${action.type}-${action.label}`}
                  href={action.href}
                  className='system-b-error-fallback__action-link'
                >
                  <Button
                    type='button'
                    variant={
                      action.variant === 'secondary' ? 'secondary' : 'primary'
                    }
                    size='sm'
                  >
                    {action.label}
                  </Button>
                </a>
              );
            }

            return (
              <Button
                key={`${action.type}-${action.label}`}
                type='button'
                variant={
                  action.variant === 'secondary' ? 'secondary' : 'primary'
                }
                size='sm'
                onClick={action.onClick}
              >
                {action.label || 'Action'}
              </Button>
            );
          })}
        </div>

        {digest ? (
          <p className='system-b-error-fallback__digest'>Error ID: {digest}</p>
        ) : null}
      </div>
    </div>
  );
}
