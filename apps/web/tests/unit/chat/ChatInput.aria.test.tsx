import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ChatInput } from '@/components/jovie/components/ChatInput';

/**
 * ARIA combobox contract for the chat composer textarea.
 *
 * When the slash picker is open, the textarea must expose:
 *   - role='combobox'
 *   - aria-expanded='true'
 *   - aria-controls={pickerListId}
 *   - aria-activedescendant={activeRowId}
 *   - aria-autocomplete='list'
 * When closed, only aria-expanded='false' (and the existing aria-label)
 * remain.
 */

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle' as const,
    search: vi.fn(),
  }),
}));

// Match ChatInput.test.tsx's motion mock so motion's ref forwarding doesn't
// blow up jsdom.
vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'div'> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
    textarea: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<'textarea'> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => <textarea {...props}>{children}</textarea>,
    span: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'span'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <span {...props}>{children}</span>,
    output: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: ComponentProps<'output'> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <output {...props}>{children}</output>,
  },
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  useReducedMotion: () => false,
}));

function withProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

interface HarnessProps {
  readonly initialValue?: string;
}

function Harness({ initialValue = '' }: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSubmit={() => {}}
      isLoading={false}
      isSubmitting={false}
      profileId='profile-test'
    />
  );
}

function getTextarea(): HTMLTextAreaElement {
  return screen.getByRole('textbox', {
    name: /chat message input/i,
  }) as HTMLTextAreaElement;
}

describe('ChatInput combobox ARIA wiring', () => {
  it('starts with aria-expanded=false and no combobox role when picker closed', () => {
    render(withProviders(<Harness />));
    const textarea = getTextarea();
    expect(textarea).toHaveAttribute('aria-expanded', 'false');
    expect(textarea).not.toHaveAttribute('role', 'combobox');
    expect(textarea).not.toHaveAttribute('aria-controls');
    expect(textarea).not.toHaveAttribute('aria-activedescendant');
  });

  it('typing "/" opens the picker and wires combobox attrs on the textarea', () => {
    render(withProviders(<Harness />));
    const textarea = getTextarea();
    textarea.focus();
    // Simulate user typing "/" — slash trigger is detected at index 0.
    fireEvent.change(textarea, { target: { value: '/' } });

    expect(textarea).toHaveAttribute('role', 'combobox');
    expect(textarea).toHaveAttribute('aria-expanded', 'true');
    expect(textarea).toHaveAttribute('aria-autocomplete', 'list');
    const controls = textarea.getAttribute('aria-controls');
    expect(controls).toBeTruthy();

    // The aria-activedescendant must reference an existing row id inside the
    // listbox.
    const activeId = textarea.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('id', controls);
    const activeRow = document.getElementById(activeId ?? '');
    expect(activeRow).not.toBeNull();
    expect(activeRow).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes the picker, clears combobox attrs, returns focus to textarea', async () => {
    render(withProviders(<Harness />));
    const textarea = getTextarea();
    textarea.focus();
    fireEvent.change(textarea, { target: { value: '/' } });
    expect(textarea).toHaveAttribute('aria-expanded', 'true');

    // SlashCommandMenu owns the global keydown listener while open.
    fireEvent.keyDown(window, { key: 'Escape' });

    // Wait one microtask for the picker close + 0ms timeout focus restore.
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(textarea).toHaveAttribute('aria-expanded', 'false');
    expect(textarea).not.toHaveAttribute('role', 'combobox');
    expect(textarea).not.toHaveAttribute('aria-controls');
    expect(textarea).not.toHaveAttribute('aria-activedescendant');
    expect(textarea).toHaveFocus();
  });

  it('the form has an accessible label', () => {
    render(withProviders(<Harness />));
    const form = screen.getByRole('form', {
      name: /compose a message/i,
    });
    expect(form).toBeInTheDocument();
  });

  it('blocks send when value is just "/" and picker is open', () => {
    render(withProviders(<Harness />));
    const textarea = getTextarea();
    textarea.focus();
    fireEvent.change(textarea, { target: { value: '/' } });

    const sendButton = screen.getByRole('button', { name: /send message/i });
    expect(sendButton).toBeDisabled();
  });
});
