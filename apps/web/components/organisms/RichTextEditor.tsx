'use client';

import { Button } from '@jovie/ui';
import type { Editor } from '@tiptap/core';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Code2,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useReducer } from 'react';
import type { RichTextDocument } from '@/lib/rich-text/document';
import { cn } from '@/lib/utils';
import styles from './RichTextEditor.module.css';

export interface RichTextEditorHandle {
  readonly focus: () => void;
}

export interface RichTextEditorChange {
  readonly content: RichTextDocument;
  readonly plainText: string;
}

export interface RichTextEditorProps {
  readonly content: RichTextDocument;
  readonly onChange: (change: RichTextEditorChange) => void;
  readonly ariaLabel: string;
  readonly placeholder?: string;
  readonly statusLabel?: string;
  readonly statusTone?: 'neutral' | 'pending' | 'success' | 'error';
  readonly statusAction?: Readonly<{
    label: string;
    onClick: () => void;
  }>;
  readonly readOnly?: boolean;
  readonly minHeight?: string;
  readonly className?: string;
  readonly onFocus?: () => void;
}

interface EditorToolbarButtonProps {
  readonly editor: Editor;
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly children: React.ReactNode;
}

function EditorToolbarButton({
  editor,
  label,
  active = false,
  disabled = false,
  onPress,
  children,
}: EditorToolbarButtonProps) {
  return (
    <Button
      type='button'
      size='icon'
      variant='ghost'
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled || !editor.isEditable}
      onMouseDown={event => event.preventDefault()}
      onClick={onPress}
      className={cn(
        'shrink-0 rounded-md text-secondary-token hover:text-primary-token',
        active && 'bg-surface-2 text-primary-token'
      )}
    >
      {children}
    </Button>
  );
}

function EditorToolbar({ editor }: Readonly<{ editor: Editor }>) {
  return (
    <div
      role='toolbar'
      aria-label='Text Formatting'
      className='flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto p-1'
    >
      <select
        aria-label='Text Style'
        value={
          editor.isActive('heading', { level: 1 })
            ? 'h1'
            : editor.isActive('heading', { level: 2 })
              ? 'h2'
              : editor.isActive('heading', { level: 3 })
                ? 'h3'
                : 'paragraph'
        }
        disabled={!editor.isEditable}
        onChange={event => {
          const chain = editor.chain().focus();
          if (event.target.value === 'paragraph') {
            chain.setParagraph().run();
            return;
          }
          const level = Number(event.target.value.slice(1)) as 1 | 2 | 3;
          chain.toggleHeading({ level }).run();
        }}
        className='h-9 shrink-0 rounded-md border-0 bg-transparent px-2 text-xs font-medium text-secondary-token outline-none hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-focus'
      >
        <option value='paragraph'>Text</option>
        <option value='h1'>Heading 1</option>
        <option value='h2'>Heading 2</option>
        <option value='h3'>Heading 3</option>
      </select>
      <span aria-hidden='true' className='mx-1 h-5 w-px shrink-0 bg-subtle' />
      <EditorToolbarButton
        editor={editor}
        label='Bold'
        active={editor.isActive('bold')}
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className='h-4 w-4' />
      </EditorToolbarButton>
      <EditorToolbarButton
        editor={editor}
        label='Italic'
        active={editor.isActive('italic')}
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className='h-4 w-4' />
      </EditorToolbarButton>
      <EditorToolbarButton
        editor={editor}
        label='Strikethrough'
        active={editor.isActive('strike')}
        onPress={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className='h-4 w-4' />
      </EditorToolbarButton>
      <EditorToolbarButton
        editor={editor}
        label='Inline Code'
        active={editor.isActive('code')}
        onPress={() => editor.chain().focus().toggleCode().run()}
      >
        <Code2 className='h-4 w-4' />
      </EditorToolbarButton>
      <span aria-hidden='true' className='mx-1 h-5 w-px shrink-0 bg-subtle' />
      <EditorToolbarButton
        editor={editor}
        label='Bulleted List'
        active={editor.isActive('bulletList')}
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className='h-4 w-4' />
      </EditorToolbarButton>
      <EditorToolbarButton
        editor={editor}
        label='Numbered List'
        active={editor.isActive('orderedList')}
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className='h-4 w-4' />
      </EditorToolbarButton>
      <EditorToolbarButton
        editor={editor}
        label='Quote'
        active={editor.isActive('blockquote')}
        onPress={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className='h-4 w-4' />
      </EditorToolbarButton>
      <span aria-hidden='true' className='mx-1 h-5 w-px shrink-0 bg-subtle' />
      <EditorToolbarButton
        editor={editor}
        label='Undo'
        disabled={!editor.can().chain().focus().undo().run()}
        onPress={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className='h-4 w-4' />
      </EditorToolbarButton>
      <EditorToolbarButton
        editor={editor}
        label='Redo'
        disabled={!editor.can().chain().focus().redo().run()}
        onPress={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className='h-4 w-4' />
      </EditorToolbarButton>
    </div>
  );
}

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  RichTextEditorProps
>(function RichTextEditor(
  {
    content,
    onChange,
    ariaLabel,
    placeholder = 'Start writing…',
    statusLabel = '',
    statusTone = 'neutral',
    statusAction,
    readOnly = false,
    minHeight = '16rem',
    className,
    onFocus,
  },
  ref
) {
  const [, refreshToolbar] = useReducer(value => value + 1, 0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          autolink: true,
          openOnClick: false,
          protocols: ['http', 'https', 'mailto'],
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChange({
        content: currentEditor.getJSON() as RichTextDocument,
        plainText: currentEditor.getText(),
      });
      refreshToolbar();
    },
    onSelectionUpdate: refreshToolbar,
    onFocus,
    editorProps: {
      attributes: {
        class: `${styles.editor} focus-visible:bg-[color-mix(in_oklab,var(--linear-border-focus)_10%,transparent)]`,
        'aria-label': ariaLabel,
        spellcheck: 'true',
        style: 'box-shadow: none',
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (
      !editor ||
      JSON.stringify(editor.getJSON()) === JSON.stringify(content)
    ) {
      return;
    }
    editor.commands.setContent(content, { emitUpdate: false });
    refreshToolbar();
  }, [content, editor]);

  useImperativeHandle(ref, () => ({ focus: () => editor?.commands.focus() }), [
    editor,
  ]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--text-primary)_3%,transparent)] focus-within:border-default',
        className
      )}
      style={{ '--editor-min-height': minHeight } as React.CSSProperties}
    >
      <div className='flex min-h-11 items-center border-b border-subtle bg-surface-0/80'>
        {editor ? (
          <EditorToolbar editor={editor} />
        ) : (
          <div className='flex-1' />
        )}
        <div
          aria-live='polite'
          className='flex min-h-11 min-w-28 shrink-0 items-center justify-end gap-2 border-l border-subtle px-2 text-xs text-secondary-token'
        >
          <span
            aria-hidden='true'
            className={cn(
              'h-1.5 w-1.5 rounded-full bg-tertiary-token',
              statusTone === 'pending' && 'animate-pulse bg-warning',
              statusTone === 'success' && 'bg-success',
              statusTone === 'error' && 'bg-error'
            )}
          />
          <span className='truncate'>{statusLabel}</span>
          {statusAction ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={statusAction.onClick}
              className='h-8 px-2 text-xs'
            >
              {statusAction.label}
            </Button>
          ) : null}
        </div>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
});
