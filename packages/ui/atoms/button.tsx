'use client';

import { cn } from '@jovie/ui/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Check } from 'lucide-react';
import * as React from 'react';

import {
  ACTION_BUTTON_MOBILE_HIT_TARGET_PX,
  ACTION_BUTTON_VISIBLE_HEIGHT_PX,
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
  type ButtonActionState,
  type ButtonSize,
  type ButtonSizeInput,
  type ButtonStateLabels,
  type ButtonVariant,
  type ButtonVariantInput,
  normalizeButtonSizeContract,
  normalizeButtonVariantContract,
  resolveButtonPenMaster,
} from './button-contract';
import { Spinner } from './spinner';

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border border-btn-primary bg-btn-primary text-btn-primary-foreground shadow-button-inset hover:border-(--color-btn-primary-hover) hover:bg-(--color-btn-primary-hover)',
  secondary:
    'border-0 bg-btn-secondary text-btn-secondary-foreground shadow-none hover:bg-(--color-btn-secondary-hover)',
  tertiary:
    'border border-transparent bg-transparent text-secondary-token shadow-none hover:bg-interactive-hover hover:text-primary-token active:bg-interactive-active',
  ghost:
    'border border-transparent bg-transparent text-tertiary-token shadow-none hover:bg-interactive-hover hover:text-primary-token active:bg-interactive-active',
  link: 'h-auto border-0 bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline',
};

// 44px minimum hit target for icon buttons below 44px (WCAG 2.5.5 / Apple HIG),
// rendered as an invisible pseudo-element so layout stays compact.
const ICON_HIT_TARGET_44 =
  'before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]';

// Every text size name is a compatibility alias for the founder-selected
// 28px minimum face, with one typography/padding contract and a 44px minimum
// hit target. Auto height preserves native text growth; the target grows with it.
const TEXT_BUTTON_CLASSES =
  'h-auto min-h-7 px-2.5 text-xs before:absolute before:left-1/2 before:top-1/2 before:h-full before:min-h-11 before:min-w-11 before:w-full before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]';

const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: TEXT_BUTTON_CLASSES,
  marketing: TEXT_BUTTON_CLASSES,
  md: TEXT_BUTTON_CLASSES,
  lg: TEXT_BUTTON_CLASSES,
  icon: `h-9 w-9 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-xs': `h-6 w-6 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-sm': `h-7 w-7 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-md': `h-8 w-8 px-0 ${ICON_HIT_TARGET_44}`,
  'icon-lg': `h-10 w-10 px-0 ${ICON_HIT_TARGET_44}`,
  // 44px container already satisfies the hit target.
  'icon-xl': 'h-11 w-11 px-0',
};

const buttonVariants = cva(
  'relative inline-flex items-center justify-center rounded-full text-app [font-weight:var(--font-weight-medium)] tracking-normal transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-subtle ease-subtle motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-page aria-disabled:pointer-events-none aria-disabled:opacity-[var(--state-disabled-opacity)] aria-disabled:text-(--color-text-disabled-token)',
  {
    variants: {
      variant: {
        ...BUTTON_VARIANT_CLASSES,
      },
      size: {
        ...BUTTON_SIZE_CLASSES,
      },
    },
    compoundVariants: [
      {
        variant: 'link',
        size: ['sm', 'marketing', 'md', 'lg'],
        className: 'w-auto min-w-0 px-0 py-0 aria-disabled:opacity-60',
      },
      {
        variant: 'link',
        size: ['icon', 'icon-xs', 'icon-sm', 'icon-md', 'icon-lg', 'icon-xl'],
        className: 'min-h-0 w-auto min-w-0 px-0 py-0 aria-disabled:opacity-60',
      },
      {
        variant: 'link',
        size: ['icon', 'icon-xs', 'icon-sm', 'icon-md', 'icon-lg', 'icon-xl'],
        className: `h-auto before:block ${ICON_HIT_TARGET_44}`,
      },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

const DESTRUCTIVE_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-error bg-error text-error-foreground hover:border-error/90 hover:bg-error/90',
  secondary:
    'border-0 bg-error-subtle text-error hover:bg-error-subtle hover:text-error',
  tertiary: 'text-error hover:bg-error-subtle hover:text-error',
  ghost: 'text-error hover:bg-error-subtle hover:text-error',
  link: 'text-error hover:text-error',
};

const warnedDeprecatedValues = new Set<string>();

function isProductionEnvironment(): boolean {
  return (
    (
      globalThis as {
        readonly process?: {
          readonly env?: { readonly NODE_ENV?: string };
        };
      }
    ).process?.env?.NODE_ENV === 'production'
  );
}

function warnDeprecatedButtonValue(
  kind: 'variant' | 'size',
  value: string,
  replacement: string
): void {
  if (isProductionEnvironment()) return;
  const key = `${kind}:${value}`;
  if (warnedDeprecatedValues.has(key)) return;
  warnedDeprecatedValues.add(key);
  console.warn(
    `[Button] ${kind}="${value}" is deprecated. Use ${kind}="${replacement}" instead.`
  );
}

function normalizeButtonVariant({
  variant,
  destructive,
}: {
  readonly variant?: ButtonVariantInput;
  readonly destructive: boolean;
}): { readonly variant: ButtonVariant; readonly destructive: boolean } {
  const normalized = normalizeButtonVariantContract({ variant, destructive });
  if (variant && variant !== normalized.variant) {
    warnDeprecatedButtonValue('variant', variant, normalized.variant);
  }
  return normalized;
}

function normalizeButtonSize(size?: ButtonSizeInput): ButtonSize {
  const normalized = normalizeButtonSizeContract(size);
  if (size && size !== normalized) {
    warnDeprecatedButtonValue('size', size, normalized);
  }
  return normalized;
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  readonly variant?: ButtonVariantInput;
  readonly size?: ButtonSizeInput;
  readonly asChild?: boolean;
  readonly loading?: boolean;
  /** Opt-in state choreography for text pills; Slot/link/icon keep legacy rendering. */
  readonly pendingPresentation?: 'spinner' | 'morph';
  readonly actionState?: ButtonActionState;
  readonly stateLabels?: Partial<ButtonStateLabels>;
  /** Enables subtle tactile compression for actions without another immediate cue. */
  readonly pressFeedback?: boolean;
  /** @deprecated Prefer leaving pressFeedback unset. */
  readonly static?: boolean;
  readonly destructive?: boolean;
}

// Helper to compute data-state attribute
function getDataState(loading: boolean, isDisabled: boolean): string {
  if (loading) return 'loading';
  if (isDisabled) return 'disabled';
  return 'idle';
}

function ButtonLoadingSpinner({
  primary,
  destructive,
}: {
  primary: boolean;
  destructive: boolean;
}) {
  return (
    <span className='absolute inset-0 flex items-center justify-center'>
      <Spinner
        size='sm'
        tone={primary ? 'inverse' : 'primary'}
        className={primary && destructive ? 'text-error-foreground' : undefined}
        label='Loading'
      />
    </span>
  );
}

// Button content wrapper
function ButtonContent({
  loading,
  children,
}: {
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5',
        loading ? 'opacity-0' : 'opacity-100'
      )}
    >
      {children}
    </span>
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      pendingPresentation = 'spinner',
      actionState = 'idle',
      stateLabels,
      pressFeedback = false,
      static: isStatic = false,
      destructive = false,
      disabled,
      'aria-busy': ariaBusy,
      'aria-disabled': ariaDisabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;
    const hasPressFeedback = pressFeedback && !isStatic && !isDisabled;
    const dataState = getDataState(loading, isDisabled);
    const normalizedVariant = normalizeButtonVariant({
      variant,
      destructive,
    });
    const normalizedSize = normalizeButtonSize(size);
    // Fail closed: only selections with a source-backed Pen master carry the
    // canonical Pen identity. Unmapped combinations render without the
    // attribute rather than claiming another master's root.
    const penMaster = resolveButtonPenMaster({
      variant: normalizedVariant.variant,
      size: normalizedSize,
      destructive: normalizedVariant.destructive,
    });
    const penContractProps = penMaster
      ? ({ 'data-pen-contract': penMaster.rootId } as const)
      : null;

    if (
      pendingPresentation === 'morph' &&
      !asChild &&
      normalizedVariant.variant !== 'link' &&
      !normalizedSize.startsWith('icon')
    ) {
      return (
        <ButtonMorph
          {...props}
          ref={ref}
          className={className}
          surfaceClassName={cn(
            buttonVariants({
              variant: normalizedVariant.variant,
              size: normalizedSize,
            }),
            normalizedVariant.destructive &&
              DESTRUCTIVE_CLASSES[normalizedVariant.variant]
          )}
          disabled={disabled}
          aria-busy={ariaBusy}
          aria-disabled={ariaDisabled}
          state={loading ? 'pending' : actionState}
          labels={stateLabels}
          primary={normalizedVariant.variant === 'primary'}
          destructive={normalizedVariant.destructive}
          data-variant={normalizedVariant.variant}
          data-size={normalizedSize}
        >
          {children}
        </ButtonMorph>
      );
    }

    const sharedProps = {
      ref,
      className: cn(
        buttonVariants({
          variant: normalizedVariant.variant,
          size: normalizedSize,
        }),
        normalizedVariant.destructive &&
          DESTRUCTIVE_CLASSES[normalizedVariant.variant],
        className,
        hasPressFeedback && 'active:scale-press motion-reduce:active:scale-100',
        isDisabled && 'pointer-events-none'
      ),
      'aria-disabled': isDisabled ? true : ariaDisabled,
      'aria-busy': loading ? true : ariaBusy,
      'data-state': dataState,
      'data-variant': normalizedVariant.variant,
      'data-size': normalizedSize,
      'data-destructive': normalizedVariant.destructive ? 'true' : undefined,
      'data-press-feedback': hasPressFeedback ? 'true' : undefined,
      'data-static': isStatic ? 'true' : undefined,
    };

    // In asChild mode, Radix Slot owns the single-child validation.
    // Do NOT render additional wrappers/spinner here; apply styles/props to the child.
    if (asChild) {
      // Next's server renderer can pass an opaque lazy child across the RSC
      // boundary. Radix Slot resolves that representation itself, while
      // React.Children.only rejects it before Slot gets the chance.
      const preventDisabledActivation = (event: React.SyntheticEvent) => {
        event.preventDefault();
        event.stopPropagation();
      };
      const disabledChildProps = isDisabled
        ? {
            'aria-disabled': true,
            ...(loading ? { 'aria-busy': true } : {}),
            onClickCapture: preventDisabledActivation,
            onAuxClickCapture: preventDisabledActivation,
          }
        : null;
      const contractChild =
        (penContractProps || disabledChildProps) &&
        React.isValidElement<{
          'data-pen-contract'?: string;
        }>(children)
          ? React.cloneElement(children, {
              ...penContractProps,
              ...disabledChildProps,
            })
          : children;

      return (
        <Comp
          {...props}
          {...sharedProps}
          {...penContractProps}
          {...disabledChildProps}
        >
          {contractChild}
        </Comp>
      );
    }

    // Normal button rendering with optional loading spinner
    const buttonProps = {
      disabled: isDisabled,
      type:
        (props as React.ButtonHTMLAttributes<HTMLButtonElement>).type ??
        'button',
    };

    return (
      <Comp {...props} {...sharedProps} {...buttonProps} {...penContractProps}>
        {loading && (
          <ButtonLoadingSpinner
            primary={normalizedVariant.variant === 'primary'}
            destructive={normalizedVariant.destructive}
          />
        )}
        <ButtonContent loading={loading}>{children}</ButtonContent>
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export type { ButtonSize, ButtonVariant };
export { BUTTON_SIZE_NAMES, BUTTON_VARIANT_NAMES, Button, buttonVariants };

interface ButtonMorphProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly surfaceClassName: string;
  readonly state: ButtonActionState;
  readonly labels?: Partial<ButtonStateLabels>;
  readonly primary: boolean;
  readonly destructive: boolean;
}

function MorphFace({
  compact,
  pending,
  keyboard,
  chrome,
}: {
  compact: boolean;
  pending: boolean;
  keyboard: boolean;
  chrome: string;
}) {
  const travel = {
    transitionDelay: pending ? 'var(--duration-fast)' : undefined,
    ...(keyboard ? { transitionProperty: 'none' } : {}),
  };
  const paint = {
    borderWidth: 0,
    boxShadow: 'none',
    height: ACTION_BUTTON_VISIBLE_HEIGHT_PX,
  };
  const paintClass = cn(
    chrome,
    'pointer-events-none absolute top-0 min-h-0 min-w-0 px-0 before:hidden'
  );
  const motionClass =
    'transition-transform duration-subtle ease-in-out motion-reduce:transition-none';
  return (
    <span
      aria-hidden='true'
      className='pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2'
      style={{ height: ACTION_BUTTON_VISIBLE_HEIGHT_PX }}
    >
      <span
        className={cn(paintClass, motionClass, 'rounded-none')}
        style={{
          ...paint,
          ...travel,
          left: ACTION_BUTTON_VISIBLE_HEIGHT_PX / 2,
          right: ACTION_BUTTON_VISIBLE_HEIGHT_PX / 2,
          transform: compact ? 'scaleX(0)' : 'scaleX(1)',
        }}
      />
      {['left', 'right'].map(edge => (
        <span
          key={edge}
          className={cn('absolute top-0 h-full w-1/2', motionClass)}
          style={{
            [edge]: 0,
            transform: compact
              ? `translateX(${edge === 'left' ? '' : '-'}100%)`
              : 'translateX(0)',
            ...travel,
          }}
        >
          <span
            data-part={edge === 'left' ? 'morph-surface' : 'morph-cap'}
            className={cn(paintClass, motionClass)}
            style={{
              ...paint,
              width: ACTION_BUTTON_VISIBLE_HEIGHT_PX,
              [edge]: 0,
              transform: compact
                ? `translateX(${edge === 'left' ? '-' : ''}50%)`
                : 'translateX(0)',
              ...travel,
            }}
          />
        </span>
      ))}
    </span>
  );
}

/** Internal presentation of Button, not a second action component. */
const ButtonMorph = React.forwardRef<HTMLButtonElement, ButtonMorphProps>(
  function ButtonMorph(
    {
      children,
      className,
      surfaceClassName,
      state,
      labels,
      primary,
      destructive,
      disabled,
      style,
      onClick,
      onClickCapture,
      onKeyDown,
      onPointerDown,
      'aria-label': ariaLabel,
      'aria-labelledby': ariaLabelledBy,
      'aria-busy': ariaBusy,
      'aria-disabled': ariaDisabled,
      type = 'button',
      ...props
    },
    ref
  ) {
    const labelId = React.useId();
    const buttonRef = React.useRef<HTMLButtonElement | null>(null);
    const [keyboard, setKeyboard] = React.useState(false);
    const [spinnerVisible, setSpinnerVisible] = React.useState(false);
    const pending = state === 'pending';
    const compact = pending || state === 'success';
    const text = {
      error: 'Could not complete.',
      pending: 'Loading',
      retry: 'Retry',
      success: 'Complete',
      ...labels,
    };

    // Delay presentation only. Action dispatch and aria-busy are synchronous.
    // Each pending episode owns its timer; reversals/unmount cancel it.
    React.useEffect(() => {
      if (!pending) {
        setSpinnerVisible(false);
        return;
      }
      const value = buttonRef.current
        ? getComputedStyle(buttonRef.current)
            .getPropertyValue('--duration-subtle')
            .trim()
        : '';
      const delay =
        Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
      const timer = setTimeout(
        () => setSpinnerVisible(true),
        Number.isFinite(delay) ? delay : 0
      );
      return () => clearTimeout(timer);
    }, [pending]);

    const noTravel = keyboard ? { transitionProperty: 'none' } : undefined;
    const status =
      state === 'idle'
        ? ''
        : state === 'error'
          ? `${text.error} ${text.retry}`
          : text[state];
    return (
      <>
        <button
          {...props}
          ref={node => {
            buttonRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          type={type}
          disabled={disabled}
          aria-busy={pending || ariaBusy}
          aria-disabled={disabled || pending || ariaDisabled}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : (ariaLabelledBy ?? labelId)}
          data-state={disabled ? 'disabled' : state}
          data-destructive={destructive || undefined}
          data-pending-presentation='morph'
          data-keyboard={keyboard || undefined}
          className={cn(
            surfaceClassName,
            'isolate max-w-full min-w-11 min-h-11',
            pending && 'aria-disabled:opacity-100',
            className
          )}
          style={{
            ...style,
            background: 'transparent',
            borderColor: 'transparent',
            boxShadow: 'none',
            minHeight: ACTION_BUTTON_MOBILE_HIT_TARGET_PX,
            minWidth: ACTION_BUTTON_MOBILE_HIT_TARGET_PX,
          }}
          onPointerDown={event => {
            setKeyboard(false);
            onPointerDown?.(event);
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') setKeyboard(true);
            onKeyDown?.(event);
          }}
          onClickCapture={event => {
            if (
              pending ||
              disabled ||
              ariaDisabled === true ||
              ariaDisabled === 'true'
            ) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            onClickCapture?.(event);
          }}
          onClick={event => {
            setKeyboard(event.detail === 0);
            onClick?.(event);
          }}
        >
          {/* Both labels reserve the larger footprint, including full-width CTAs.
              Only the face's caps/fill transform; the target/ring never move. */}
          <span
            aria-hidden='true'
            className='invisible grid min-w-0 max-w-full'
          >
            <span className='col-start-1 row-start-1 truncate'>{children}</span>
            <span className='col-start-1 row-start-1 truncate'>
              {text.retry}
            </span>
          </span>
          <span id={labelId} className='sr-only'>
            {state === 'error' ? `${text.error} ${text.retry}` : children}
          </span>
          <MorphFace
            compact={compact}
            pending={pending}
            keyboard={keyboard}
            chrome={surfaceClassName}
          />
          <span
            aria-hidden='true'
            data-part='morph-label'
            className='pointer-events-none absolute inset-0 flex min-w-0 items-center justify-center px-2.5 transition-opacity duration-fast ease-subtle motion-reduce:transition-none'
            style={{ opacity: compact ? 0 : 1, ...noTravel }}
          >
            <span className='grid w-full min-w-0'>
              <span
                className='col-start-1 row-start-1 inline-flex min-w-0 items-center justify-center gap-1.5 truncate'
                style={{ opacity: state === 'error' ? 0 : 1 }}
              >
                {children}
              </span>
              <span
                className='col-start-1 row-start-1 truncate'
                style={{ opacity: state === 'error' ? 1 : 0 }}
              >
                {text.retry}
              </span>
            </span>
          </span>
          <span
            aria-hidden='true'
            className='pointer-events-none absolute inset-0 flex items-center justify-center'
          >
            {pending && (
              <span
                data-part='morph-spinner'
                style={{ opacity: spinnerVisible ? 1 : 0 }}
              >
                <Spinner
                  size='sm'
                  tone={primary ? 'inverse' : 'primary'}
                  className={
                    primary && destructive ? 'text-error-foreground' : undefined
                  }
                />
              </span>
            )}
            <Check
              data-part='morph-check'
              className='absolute size-4 transition-opacity duration-subtle ease-subtle motion-reduce:transition-none'
              style={{ opacity: state === 'success' ? 1 : 0, ...noTravel }}
            />
          </span>
        </button>
        <span
          role='status'
          aria-live='polite'
          aria-atomic='true'
          className='sr-only'
        >
          {status}
        </span>
      </>
    );
  }
);
