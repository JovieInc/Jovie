'use client';

import { Button } from '@jovie/ui';

import { AlertTriangle, Copy, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from '@/components/feedback';
import { cn } from '@/lib/utils';
import {
  ERROR_BANNER_ACTION_LAYOUT_CLASS,
  ERROR_BANNER_ACTION_SIZE,
  ERROR_BANNER_ACTIONS_ROW_CLASS,
  ERROR_BANNER_BODY_CLASS,
  ERROR_BANNER_COPY_ICON_CLASS,
  ERROR_BANNER_COPY_SIZE,
  ERROR_BANNER_DESCRIPTION_CLASS,
  ERROR_BANNER_DETAILS_META_CLASS,
  ERROR_BANNER_DETAILS_PANEL_CLASS,
  ERROR_BANNER_DETAILS_TOGGLE_CLASS,
  ERROR_BANNER_DETAILS_WRAP_CLASS,
  ERROR_BANNER_DEV_PANEL_CLASS,
  ERROR_BANNER_DEV_PRE_CLASS,
  ERROR_BANNER_DEV_SUMMARY_CLASS,
  ERROR_BANNER_DISMISS_ICON_CLASS,
  ERROR_BANNER_DISMISS_LAYOUT_CLASS,
  ERROR_BANNER_DISMISS_SIZE,
  ERROR_BANNER_ICON_CLASS,
  ERROR_BANNER_ICON_WRAP_CLASS,
  ERROR_BANNER_ROW_CLASS,
  ERROR_BANNER_SHELL_GEOMETRY_CLASS,
  ERROR_BANNER_SHELL_SEMANTIC_CLASS,
  ERROR_BANNER_TITLE_CLASS,
} from './error-banner-semantic-contract';
import { RECOVERY_COPY } from './recovery-contract';

export interface ErrorBannerAction {
  readonly label: string;
  readonly onClick?: () => void;
  readonly href?: string;
  /**
   * Error states have one recovery path. Additional exits remain quiet so the
   * alert does not give equal visual weight to every action.
   */
  readonly variant?: 'primary' | 'secondary';
}

export interface ErrorBannerProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ErrorBannerAction[];
  readonly className?: string;
  readonly testId?: string;
  /** Optional callback to dismiss the banner. When provided, renders a close button. */
  readonly onDismiss?: () => void;
  /** Optional error object with digest */
  readonly error?: Error & { digest?: string };
}

export function ErrorBanner({
  title,
  description,
  actions = [],
  className,
  testId,
  onDismiss,
  error,
}: ErrorBannerProps) {
  const [timestamp] = useState(() => new Date());
  const [showDetails, setShowDetails] = useState(false);

  const handleCopyErrorDetails = () => {
    const details = [
      `Error ID: ${error?.digest || 'unknown'}`,
      `Time: ${timestamp.toISOString()}`,
      `Title: ${title}`,
      ...(description ? [`Description: ${description}`] : []),
      `URL: ${globalThis.location?.href ?? 'N/A'}`,
      `User Agent: ${globalThis.navigator?.userAgent ?? 'N/A'}`,
    ].join('\n');

    navigator.clipboard
      .writeText(details)
      .then(() => {
        toast.success('Copied');
      })
      .catch(() => {
        toast.error('Failed to copy error details');
      });
  };

  const renderAction = (action: ErrorBannerAction, index: number) => {
    const variant = action.variant ?? (index === 0 ? 'primary' : 'secondary');

    if (action.href) {
      const isInternal = action.href.startsWith('/');

      if (isInternal && !action.onClick) {
        return (
          <Button
            key={`${action.label}-${index}`}
            asChild
            variant={variant}
            size={ERROR_BANNER_ACTION_SIZE}
            className={ERROR_BANNER_ACTION_LAYOUT_CLASS}
          >
            <Link href={action.href}>{action.label}</Link>
          </Button>
        );
      }

      return (
        <Button
          key={`${action.label}-${index}`}
          asChild
          variant={variant}
          size={ERROR_BANNER_ACTION_SIZE}
          className={ERROR_BANNER_ACTION_LAYOUT_CLASS}
        >
          <a href={action.href} onClick={action.onClick}>
            {action.label}
          </a>
        </Button>
      );
    }

    return (
      <Button
        key={`${action.label}-${index}`}
        type='button'
        variant={variant}
        size={ERROR_BANNER_ACTION_SIZE}
        onClick={action.onClick}
        className={ERROR_BANNER_ACTION_LAYOUT_CLASS}
      >
        {action.label || 'Action'}
      </Button>
    );
  };

  return (
    <div
      role='alert'
      aria-live='assertive'
      aria-label='Error'
      data-testid={testId ?? 'app-error-banner'}
      className={cn(
        ERROR_BANNER_SHELL_GEOMETRY_CLASS,
        ERROR_BANNER_SHELL_SEMANTIC_CLASS,
        className
      )}
    >
      <div className={ERROR_BANNER_ROW_CLASS}>
        <span className={ERROR_BANNER_ICON_WRAP_CLASS}>
          <AlertTriangle
            className={ERROR_BANNER_ICON_CLASS}
            aria-hidden='true'
          />
        </span>

        <div className={ERROR_BANNER_BODY_CLASS}>
          <p className={ERROR_BANNER_TITLE_CLASS}>{title}</p>
          {description ? (
            <p className={ERROR_BANNER_DESCRIPTION_CLASS}>{description}</p>
          ) : null}

          {actions.length > 0 ? (
            <div className={ERROR_BANNER_ACTIONS_ROW_CLASS}>
              {actions.map((action, index) => renderAction(action, index))}
            </div>
          ) : null}

          <div className={ERROR_BANNER_DETAILS_WRAP_CLASS}>
            <Button
              type='button'
              variant='link'
              onClick={() => setShowDetails(!showDetails)}
              className={ERROR_BANNER_DETAILS_TOGGLE_CLASS}
            >
              {showDetails
                ? `Hide ${RECOVERY_COPY.detailsLabel}`
                : `Show ${RECOVERY_COPY.detailsLabel}`}
            </Button>

            {showDetails && (
              <div className={ERROR_BANNER_DETAILS_PANEL_CLASS}>
                {error?.digest && (
                  <p className={ERROR_BANNER_DETAILS_META_CLASS}>
                    Error ID: {error.digest}
                  </p>
                )}
                <p className={ERROR_BANNER_DETAILS_META_CLASS}>
                  Time: {timestamp.toLocaleString()}
                </p>

                <Button
                  type='button'
                  variant='ghost'
                  size={ERROR_BANNER_COPY_SIZE}
                  onClick={handleCopyErrorDetails}
                  aria-label='Copy Error Details To Clipboard'
                >
                  <Copy
                    className={ERROR_BANNER_COPY_ICON_CLASS}
                    aria-hidden='true'
                  />
                  Copy Error Details
                </Button>

                {process.env.NODE_ENV === 'development' && error?.message && (
                  <details className={ERROR_BANNER_DEV_PANEL_CLASS}>
                    <summary className={ERROR_BANNER_DEV_SUMMARY_CLASS}>
                      Developer Info (dev only)
                    </summary>
                    <pre className={ERROR_BANNER_DEV_PRE_CLASS}>
                      {error.message}
                      {error.stack && `\n\n${error.stack}`}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>

        {onDismiss ? (
          <Button
            type='button'
            variant='ghost'
            size={ERROR_BANNER_DISMISS_SIZE}
            onClick={onDismiss}
            aria-label='Dismiss Error'
            className={ERROR_BANNER_DISMISS_LAYOUT_CLASS}
          >
            <X className={ERROR_BANNER_DISMISS_ICON_CLASS} aria-hidden='true' />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
