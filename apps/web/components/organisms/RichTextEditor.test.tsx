import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from './RichTextEditor';

Object.defineProperty(Range.prototype, 'getClientRects', {
  value: () => [],
});
Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  value: () => new DOMRect(0, 0, 0, 0),
});

const content = {
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Opening beat' }],
    },
  ],
};

describe('RichTextEditor', () => {
  it('exposes direct formatting controls and the current save state', () => {
    render(
      <RichTextEditor
        content={content}
        onChange={vi.fn()}
        ariaLabel='Document Body'
        statusLabel='Saved'
        statusTone='success'
      />
    );

    expect(screen.getByLabelText('Document Body')).toHaveTextContent(
      'Opening beat'
    );
    expect(
      screen.getByRole('toolbar', { name: 'Text Formatting' })
    ).toBeVisible();
    for (const name of [
      'Bold',
      'Italic',
      'Strikethrough',
      'Inline Code',
      'Bulleted List',
      'Numbered List',
      'Quote',
      'Undo',
      'Redo',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('keeps recovery visible and keyboard-operable', () => {
    const onRetry = vi.fn();
    render(
      <RichTextEditor
        content={content}
        onChange={vi.fn()}
        ariaLabel='Document Body'
        statusLabel='Not saved'
        statusTone='error'
        statusAction={{ label: 'Retry', onClick: onRetry }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('applies direct formatting commands and disables them in read-only mode', async () => {
    const view = render(
      <RichTextEditor
        content={content}
        onChange={vi.fn()}
        ariaLabel='Document Body'
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Text Style' }), {
      target: { value: 'h2' },
    });
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Text Style' })).toHaveValue(
        'h2'
      )
    );
    for (const name of [
      'Bold',
      'Italic',
      'Strikethrough',
      'Inline Code',
      'Bulleted List',
      'Numbered List',
      'Quote',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
    }

    view.rerender(
      <RichTextEditor
        content={content}
        onChange={vi.fn()}
        ariaLabel='Document Body'
        readOnly
      />
    );
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Text Style' })).toBeDisabled();
  });

  it('synchronizes external document changes without emitting a local edit', async () => {
    const onChange = vi.fn();
    const view = render(
      <RichTextEditor
        content={content}
        onChange={onChange}
        ariaLabel='Document Body'
      />
    );
    const replacement = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Second document' }],
        },
      ],
    };
    onChange.mockClear();

    view.rerender(
      <RichTextEditor
        content={replacement}
        onChange={onChange}
        ariaLabel='Document Body'
      />
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Document Body')).toHaveTextContent(
        'Second document'
      )
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not expose an underline shortcut outside the shared schema', () => {
    const onChange = vi.fn();
    render(
      <RichTextEditor
        content={content}
        onChange={onChange}
        ariaLabel='Document Body'
      />
    );
    onChange.mockClear();

    fireEvent.keyDown(screen.getByLabelText('Document Body'), {
      key: 'u',
      metaKey: true,
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});
