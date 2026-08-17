import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { CreatorDocumentsWorkspace } from './CreatorDocumentsWorkspace';

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@tiptap/react', () => ({
  EditorContent: () => <textarea aria-label='Document content' readOnly />,
  useEditor: () => ({
    getJSON: () => ({ type: 'doc', content: [] }),
    getText: () => 'Updated body',
  }),
}));

vi.mock('@/components/molecules/drawer/EntitySidebarShell', () => ({
  EntitySidebarShell: ({
    children,
    footer,
  }: {
    children: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <aside>
      {children}
      {footer}
    </aside>
  ),
}));

const document = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'A durable idea',
  kind: 'idea' as const,
  stage: 'private_draft' as const,
  currentRevision: 1,
  content: { type: 'doc' as const, content: [] },
  plainText: 'Body',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

describe('CreatorDocumentsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('captures an idea privately with an idempotency key', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ documentId: document.id }), { status: 201 })
    );
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });

    render(<CreatorDocumentsWorkspace initialDocuments={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Idea' }));
    fireEvent.change(screen.getByLabelText('Idea Title'), {
      target: { value: 'Misunderstood recovery claim' },
    });
    fireEvent.change(screen.getByLabelText('Idea Details'), {
      target: { value: 'Research both strongest explanations.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Privately' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(request).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      title: 'Misunderstood recovery claim',
      body: 'Research both strongest explanations.',
    });
    expect(JSON.parse(String(request?.body)).idempotencyKey).toBeTruthy();
  });

  it('retries an unconfirmed capture with the same idempotency key', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ documentId: document.id }), {
          status: 200,
        })
      );
    vi.stubGlobal('location', { reload: vi.fn() });

    render(<CreatorDocumentsWorkspace initialDocuments={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Idea' }));
    fireEvent.change(screen.getByLabelText('Idea Title'), {
      target: { value: 'One retry-safe idea' },
    });
    fireEvent.change(screen.getByLabelText('Idea Details'), {
      target: { value: 'Keep this exact capture private.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Privately' }));
    await screen.findByRole('button', { name: 'Retry Private Save' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Private Save' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const first = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    const second = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)
    );
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('opens a Tasks-like accessible right panel for the selected revision', () => {
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));

    const registeredPanel = vi
      .mocked(useRegisterRightPanel)
      .mock.calls.at(-1)?.[0];
    expect(registeredPanel).toBeTruthy();
    if (!registeredPanel) throw new Error('Expected a document panel');
    render(registeredPanel);
    expect(screen.getByLabelText('Document Title')).toBeInTheDocument();
  });

  it('persists an edit as the next optimistic revision', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ revision: 2 }), { status: 200 })
    );
    render(<CreatorDocumentsWorkspace initialDocuments={[document]} />);
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'A durable revised idea' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Revision' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, request] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(`/api/library/documents/${document.id}`);
    expect(JSON.parse(String(request?.body))).toMatchObject({
      expectedRevision: 1,
      title: 'A durable revised idea',
      plainText: 'Updated body',
    });
    expect(
      await screen.findByText('Saved as a new revision')
    ).toBeInTheDocument();
  });

  it('keeps exact-revision approval disabled while visible edits are unsaved', () => {
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[
          { ...document, kind: 'script', stage: 'evidence_review' },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Document Title'), {
      target: { value: 'Unsaved title' },
    });
    expect(
      screen.getByRole('button', { name: 'Approve For Capture' })
    ).toBeDisabled();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('provides an evidence path before creator approval', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ claimId: 'claim-1' }), { status: 201 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stage: 'evidence_review' }), {
          status: 200,
        })
      );
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Recovery differs by training history.' },
    });
    fireEvent.change(screen.getByLabelText('Memory Source Record ID'), {
      target: { value: '44444444-4444-4444-8444-444444444444' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Claim' }));
    await screen.findByText('Claim added to this revision');
    fireEvent.click(
      screen.getByRole('button', { name: 'Complete Evidence Review' })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain('/claims');
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toContain('/review');
  });

  it('retains claim evidence after a failed submission', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
    render(
      <CreatorDocumentsWorkspace
        initialDocuments={[{ ...document, kind: 'script' }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /A durable idea/ }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    if (!panel) throw new Error('Expected a document panel');
    render(panel);

    fireEvent.change(screen.getByLabelText('Claim Text'), {
      target: { value: 'Retain this claim' },
    });
    fireEvent.change(screen.getByLabelText('Memory Source Record ID'), {
      target: { value: '44444444-4444-4444-8444-444444444444' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Claim' }));

    await screen.findByText('Action failed. Retry safely.');
    expect(screen.getByLabelText('Claim Text')).toHaveValue(
      'Retain this claim'
    );
    expect(screen.getByLabelText('Memory Source Record ID')).toHaveValue(
      '44444444-4444-4444-8444-444444444444'
    );
  });
});
