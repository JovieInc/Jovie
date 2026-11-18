import React from 'react';

/**
 * Stand-in for the RichTextEditor in TasksPageClient tests: a plain textarea
 * that reports changes the way the real editor does, plus a button that
 * emits an unchanged update. TasksPageClient.test.tsx swaps it for the real
 * editor when `editorTestState.real` is set.
 */
export const MockRichTextEditor = React.forwardRef(function MockRichTextEditor(
  {
    ariaLabel,
    content,
    onChange,
    onFocus,
    placeholder,
    statusLabel,
    statusAction,
  }: {
    ariaLabel: string;
    content: {
      type: 'doc';
      content?: Array<Record<string, unknown>>;
    };
    onChange: (change: {
      content: {
        type: 'doc';
        content: Array<Record<string, unknown>>;
      };
      plainText: string;
    }) => void;
    onFocus?: () => void;
    placeholder?: string;
    statusLabel?: string;
    statusAction?: { label: string; onClick: () => void };
  },
  ref: React.ForwardedRef<{ focus: () => void }>
) {
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  React.useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));
  const plainText = (content.content ?? [])
    .flatMap(node =>
      Array.isArray(node.content)
        ? (node.content as Array<Record<string, unknown>>)
            .map(child => child.text)
            .filter((value): value is string => typeof value === 'string')
        : []
    )
    .join('\n');

  return (
    <div>
      <textarea
        ref={inputRef}
        aria-label={ariaLabel}
        value={plainText}
        placeholder={placeholder || undefined}
        onFocus={onFocus}
        onChange={event =>
          onChange({
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  ...(event.target.value
                    ? {
                        content: [{ type: 'text', text: event.target.value }],
                      }
                    : {}),
                },
              ],
            },
            plainText: event.target.value,
          })
        }
        className='focus-visible:bg-surface-1'
        style={{ boxShadow: 'none' }}
      />
      <button
        type='button'
        onClick={() =>
          onChange({
            content: { ...content, content: content.content ?? [] },
            plainText,
          })
        }
      >
        Emit unchanged editor update
      </button>
      <span>{statusLabel}</span>
      {statusAction ? (
        <button type='button' onClick={statusAction.onClick}>
          {statusAction.label}
        </button>
      ) : null}
    </div>
  );
});
